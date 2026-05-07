"use strict";
(() => {
  // extensions/komga/src/api.ts
  function parseLibraries(json) {
    const arr = json;
    return arr.map((lib) => ({
      id: lib.id,
      name: lib.name
    }));
  }
  function parseSeries(json) {
    const page = json;
    return {
      items: (page.content ?? []).map((s) => ({
        id: s.id,
        title: s.metadata?.title ?? "",
        libraryId: s.libraryId,
        coverUrl: `/api/v1/series/${s.id}/thumbnail`
      })),
      page: page.number + 1,
      totalPages: page.totalPages,
      hasNextPage: !page.last
    };
  }
  function parseSeriesToListing(json) {
    const page = json;
    return {
      items: (page.content ?? []).map((s) => ({
        id: s.id,
        title: s.metadata?.title ?? "",
        coverUrl: `/api/v1/series/${s.id}/thumbnail`
      })),
      page: page.number + 1,
      totalPages: page.totalPages,
      hasNextPage: !page.last
    };
  }
  function getTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function getKomgaBookTitle(book) {
    return getTrimmedString(book.metadata?.title) || getTrimmedString(book.name) || getTrimmedString(book.seriesTitle) || book.id;
  }
  function parseBookListingItems(json) {
    const page = json;
    return (page.content ?? []).map((book) => {
      const metadata = {
        resultType: "komga-book"
      };
      if (typeof book.seriesId === "string") {
        metadata.seriesId = book.seriesId;
      }
      if (typeof book.seriesTitle === "string") {
        metadata.seriesTitle = book.seriesTitle;
      }
      if (typeof book.libraryId === "string") {
        metadata.libraryId = book.libraryId;
      }
      return {
        id: book.id,
        title: getKomgaBookTitle(book),
        coverUrl: `/api/v1/books/${encodeURIComponent(book.id)}/thumbnail`,
        metadata
      };
    });
  }
  function dedupeListingItemsById(items) {
    const seenIds = /* @__PURE__ */ new Set();
    const dedupedItems = [];
    for (const item of items) {
      if (seenIds.has(item.id)) {
        continue;
      }
      seenIds.add(item.id);
      dedupedItems.push(item);
    }
    return dedupedItems;
  }
  function isKomgaBookDto(value) {
    return Boolean(
      value && typeof value === "object" && typeof value.id === "string"
    );
  }
  function parseBooks(json) {
    const page = json;
    return (page.content ?? []).map((book) => ({
      id: book.id,
      title: getKomgaBookTitle(book),
      coverUrl: `/api/v1/books/${encodeURIComponent(book.id)}/thumbnail`,
      number: book.metadata?.numberSort
    }));
  }
  function parseReadProgress(bookJson) {
    const book = bookJson;
    if (!book.readProgress) {
      return null;
    }
    const progress = book.readProgress;
    const totalPages = book.media?.pagesCount ?? 0;
    const percentage = totalPages > 0 ? Math.round(progress.page / totalPages * 100) : 0;
    return {
      page: progress.page,
      totalPages,
      percentage,
      lastRead: progress.readDate
    };
  }
  function buildKomgaIsCondition(field, value) {
    return {
      anyOf: [
        {
          [field]: {
            operator: "is",
            value
          }
        }
      ]
    };
  }
  function buildKomgaContainsCondition(field, value) {
    return {
      [field]: {
        operator: "contains",
        value
      }
    };
  }
  function buildLegacyQueryString(params) {
    const entries = params.filter(([, value]) => value !== void 0 && value !== "").map(([key, value]) => {
      const encodedValue = key === "sort" ? String(value) : encodeURIComponent(String(value));
      return `${key}=${encodedValue}`;
    });
    return entries.length > 0 ? `?${entries.join("&")}` : "";
  }
  function buildSeriesSearchBody(libraryId, filters) {
    const body = {};
    const conditions = [];
    if (libraryId) {
      conditions.push(buildKomgaIsCondition("libraryId", libraryId));
    }
    if (filters?.genre) {
      conditions.push(buildKomgaIsCondition("genre", filters.genre));
    }
    if (conditions.length === 1) {
      body.condition = conditions[0];
    } else if (conditions.length > 1) {
      body.condition = {
        allOf: conditions
      };
    }
    if (filters?.query) {
      body.fullTextSearch = filters.query;
    }
    return body;
  }
  function buildBooksSearchBody(seriesId) {
    return {
      condition: {
        allOf: [
          buildKomgaIsCondition("seriesId", seriesId)
        ]
      }
    };
  }
  function buildBooksTitleContainsSearchBody(query) {
    return {
      condition: {
        anyOf: [
          buildKomgaContainsCondition("title", query)
        ]
      }
    };
  }
  function buildSeriesTitleContainsSearchBody(query) {
    return {
      condition: {
        anyOf: [
          buildKomgaContainsCondition("title", query),
          buildKomgaContainsCondition("titleSort", query)
        ]
      }
    };
  }
  function buildLegacySeriesListUrl(options) {
    return `/api/v1/series${buildLegacyQueryString([
      ["page", options.page],
      ["size", options.size],
      ["sort", options.sort],
      ["search", options.query],
      ["library_id", options.libraryId],
      ["genre", options.genre]
    ])}`;
  }
  function buildLegacyBooksListUrl(options) {
    return `/api/v1/books${buildLegacyQueryString([
      ["page", options.page],
      ["size", options.size],
      ["sort", options.sort],
      ["search", options.query],
      ["library_id", options.libraryId]
    ])}`;
  }
  function buildLegacySeriesBooksUrl(seriesId, options) {
    const encodedSeriesId = encodeURIComponent(seriesId);
    return `/api/v1/series/${encodedSeriesId}/books${buildLegacyQueryString([
      ["page", options.page],
      ["size", options.size],
      ["sort", options.sort]
    ])}`;
  }
  function getSeriesPage(filters) {
    if (typeof filters?.page === "number" && filters.page > 0) {
      return Math.floor(filters.page);
    }
    return 1;
  }
  function getSeriesSort(filters) {
    const normalizedSort = filters?.sort?.trim().toLowerCase();
    switch (normalizedSort) {
      case void 0:
      case "":
      case "title":
      case "title-asc":
        return "metadata.title,asc";
      case "title-desc":
        return "metadata.title,desc";
      case "recent":
      case "latest":
        return "lastModified,desc";
      case "oldest":
        return "lastModified,asc";
      default:
        return filters?.sort ?? "metadata.title,asc";
    }
  }

  // extensions/komga/src/fetch.ts
  var KomgaFetchError = class extends Error {
    constructor(status, path, message) {
      super(message);
      this.name = "KomgaFetchError";
      Object.setPrototypeOf(this, new.target.prototype);
      this.status = status;
      this.path = path;
    }
  };
  function isKomgaBridgeError(error) {
    return !!error && typeof error === "object" && "code" in error && "message" in error && typeof error.code === "string" && typeof error.message === "string";
  }
  function isKomgaFetchError(error) {
    return error instanceof KomgaFetchError;
  }
  async function komgaFetch(path, options) {
    const method = options?.method ?? "GET";
    const fetchParams = {
      url: path,
      method
    };
    if (options?.body !== void 0) {
      fetchParams.headers = { "Content-Type": "application/json" };
      fetchParams.body = JSON.stringify(options.body);
    }
    const bridge = window.bridge;
    if (!bridge?.request) {
      throw new Error("Komga bridge is unavailable");
    }
    let response;
    try {
      response = await bridge.request(
        "fetch",
        fetchParams
      );
    } catch (error) {
      if (isKomgaBridgeError(error) && error.code === "AUTH_ERROR") {
        const normalizedMessage = error.message.trim().toLowerCase();
        if (normalizedMessage === "forbidden") {
          throw new KomgaFetchError(
            403,
            path,
            "Permission denied: missing required role (FILE_DOWNLOAD or PAGE_STREAMING)"
          );
        }
        throw new KomgaFetchError(
          401,
          path,
          "Authentication failed: invalid API key or credentials"
        );
      }
      throw error;
    }
    if (response.status === 401) {
      throw new KomgaFetchError(
        401,
        path,
        "Authentication failed: invalid API key or credentials"
      );
    }
    if (response.status === 403) {
      throw new KomgaFetchError(
        403,
        path,
        "Permission denied: missing required role (FILE_DOWNLOAD or PAGE_STREAMING)"
      );
    }
    if (response.status === 404 && options?.allowNotFound) {
      return null;
    }
    if (response.status >= 400) {
      throw new KomgaFetchError(
        response.status,
        path,
        `Komga API error: ${response.status}`
      );
    }
    if (response.status === 204 || !response.body) {
      return null;
    }
    try {
      return JSON.parse(response.body);
    } catch {
      throw new Error("Komga API returned invalid JSON");
    }
  }

  // extensions/komga/src/index.ts
  var KOMGA_PAGE_SIZE = 20;
  var KOMGA_BOOKS_PAGE_SIZE = 500;
  function shouldUseLegacyFallback(error) {
    return isKomgaFetchError(error) && (error.status === 404 || error.status === 405);
  }
  function getPreferredSearchError(errors) {
    return errors.find((error) => !isKomgaFetchError(error)) ?? errors.find((error) => !shouldUseLegacyFallback(error)) ?? errors[0] ?? new Error("Komga search failed");
  }
  async function fetchKomgaWithFallback(primary, fallback) {
    try {
      return await primary();
    } catch (error) {
      if (!shouldUseLegacyFallback(error)) {
        throw error;
      }
      return fallback();
    }
  }
  async function searchKomgaSeries(normalizedQuery) {
    let fullTextJson;
    try {
      fullTextJson = await komgaFetch(
        `/api/v1/series/list?page=0&size=${KOMGA_PAGE_SIZE}`,
        { method: "POST", body: { fullTextSearch: normalizedQuery } }
      );
    } catch (error) {
      if (!shouldUseLegacyFallback(error)) {
        throw error;
      }
      const legacyJson = await komgaFetch(
        buildLegacySeriesListUrl({
          page: 0,
          size: KOMGA_PAGE_SIZE,
          query: normalizedQuery
        })
      );
      return parseSeriesToListing(legacyJson).items;
    }
    const fullTextResults = parseSeriesToListing(fullTextJson).items;
    if (fullTextResults.length > 0) {
      return fullTextResults;
    }
    const titleJson = await komgaFetch(
      `/api/v1/series/list?page=0&size=${KOMGA_PAGE_SIZE}`,
      {
        method: "POST",
        body: buildSeriesTitleContainsSearchBody(normalizedQuery)
      }
    );
    return parseSeriesToListing(titleJson).items;
  }
  async function searchKomgaBooks(normalizedQuery) {
    let fullTextJson;
    try {
      fullTextJson = await komgaFetch(
        `/api/v1/books/list?page=0&size=${KOMGA_PAGE_SIZE}`,
        { method: "POST", body: { fullTextSearch: normalizedQuery } }
      );
    } catch (error) {
      if (!shouldUseLegacyFallback(error)) {
        throw error;
      }
      const legacyJson = await komgaFetch(
        buildLegacyBooksListUrl({
          page: 0,
          size: KOMGA_PAGE_SIZE,
          query: normalizedQuery
        })
      );
      return parseBookListingItems(legacyJson);
    }
    const fullTextResults = parseBookListingItems(fullTextJson);
    if (fullTextResults.length > 0) {
      return fullTextResults;
    }
    const titleJson = await komgaFetch(
      `/api/v1/books/list?page=0&size=${KOMGA_PAGE_SIZE}`,
      {
        method: "POST",
        body: buildBooksTitleContainsSearchBody(normalizedQuery)
      }
    );
    return parseBookListingItems(titleJson);
  }
  var extension = {
    id: "server-komga",
    name: "Komga Server",
    version: "0.1.6",
    type: "server",
    serverType: "komga",
    async activate(_config) {
      const bridge = window.bridge;
      if (!bridge?.request) {
        throw new Error("Komga bridge is unavailable");
      }
    },
    async deactivate() {
    },
    async fetchListing(page) {
      const komgaPage = (page ?? 1) - 1;
      const json = await fetchKomgaWithFallback(
        () => komgaFetch(
          `/api/v1/series/list?page=${komgaPage}&size=${KOMGA_PAGE_SIZE}&sort=lastModified,desc`,
          { method: "POST", body: {} }
        ),
        () => komgaFetch(
          buildLegacySeriesListUrl({
            page: komgaPage,
            size: KOMGA_PAGE_SIZE,
            sort: "lastModified,desc"
          })
        )
      );
      return parseSeriesToListing(json);
    },
    async search(query) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        return [];
      }
      const [bookOutcome, seriesOutcome] = await Promise.allSettled([
        searchKomgaBooks(normalizedQuery),
        searchKomgaSeries(normalizedQuery)
      ]);
      const errors = [];
      const bookResults = bookOutcome.status === "fulfilled" ? bookOutcome.value : [];
      const seriesResults = seriesOutcome.status === "fulfilled" ? seriesOutcome.value : [];
      if (bookOutcome.status === "rejected") {
        errors.push(bookOutcome.reason);
      }
      if (seriesOutcome.status === "rejected") {
        errors.push(seriesOutcome.reason);
      }
      if (errors.length === 2) {
        throw getPreferredSearchError(errors);
      }
      return dedupeListingItemsById([
        ...bookResults,
        ...seriesResults
      ]);
    },
    async fetchChapters(itemId) {
      const json = await fetchKomgaWithFallback(
        () => komgaFetch(
          `/api/v1/books/list?page=0&size=${KOMGA_BOOKS_PAGE_SIZE}&sort=metadata.numberSort,asc`,
          { method: "POST", body: buildBooksSearchBody(itemId) }
        ),
        () => komgaFetch(
          buildLegacySeriesBooksUrl(itemId, {
            page: 0,
            size: KOMGA_BOOKS_PAGE_SIZE,
            sort: "metadata.numberSort,asc"
          })
        )
      );
      const chapters = parseBooks(json);
      if (chapters.length > 0) {
        return chapters;
      }
      const directBookJson = await komgaFetch(
        `/api/v1/books/${encodeURIComponent(itemId)}`,
        { allowNotFound: true }
      );
      if (!isKomgaBookDto(directBookJson)) {
        return [];
      }
      return parseBooks({ content: [directBookJson] });
    },
    getSettings() {
      return {};
    },
    // ServerExtension methods
    async testConnection() {
      try {
        await komgaFetch("/api/v1/libraries");
        return true;
      } catch {
        return false;
      }
    },
    async getLibraries() {
      const json = await komgaFetch("/api/v1/libraries");
      return parseLibraries(json);
    },
    async getSeries(libraryId, filters) {
      const body = buildSeriesSearchBody(libraryId, filters);
      const komgaPage = getSeriesPage(filters) - 1;
      const sort = getSeriesSort(filters);
      const json = await fetchKomgaWithFallback(
        () => komgaFetch(
          `/api/v1/series/list?page=${komgaPage}&size=${KOMGA_PAGE_SIZE}&sort=${sort}`,
          { method: "POST", body }
        ),
        () => komgaFetch(
          buildLegacySeriesListUrl({
            page: komgaPage,
            size: KOMGA_PAGE_SIZE,
            sort,
            query: filters?.query,
            libraryId,
            genre: filters?.genre
          })
        )
      );
      return parseSeries(json);
    },
    getPageUrl(chapterId, page) {
      return `/api/v1/books/${chapterId}/pages/${page}`;
    },
    getDownloadUrl(chapterId) {
      return `/api/v1/books/${chapterId}/file`;
    },
    async getReadProgress(chapterId) {
      const json = await komgaFetch(`/api/v1/books/${chapterId}`, {
        allowNotFound: true
      });
      if (!json) return null;
      return parseReadProgress(json);
    },
    async updateReadProgress(chapterId, progress) {
      await komgaFetch(`/api/v1/books/${chapterId}/read-progress`, {
        method: "PATCH",
        body: {
          page: progress.page,
          completed: progress.percentage >= 100
        }
      });
    }
  };
  function getObjectParam(params) {
    if (params && typeof params === "object" && !Array.isArray(params)) {
      return params;
    }
    return {};
  }
  window.__extensionHandler = async function(message) {
    const params = getObjectParam(message.params);
    switch (message.method) {
      case "activate":
        return extension.activate(params);
      case "deactivate":
        return extension.deactivate();
      case "fetchListing":
        return extension.fetchListing(
          typeof params.page === "number" ? params.page : void 0
        );
      case "search":
        return extension.search(
          typeof params.query === "string" ? params.query : ""
        );
      case "fetchChapters":
        return extension.fetchChapters(
          typeof params.itemId === "string" ? params.itemId : ""
        );
      case "getSettings":
        return extension.getSettings();
      case "testConnection":
        return extension.testConnection();
      case "getLibraries":
        return extension.getLibraries();
      case "getSeries":
        return extension.getSeries(
          typeof params.libraryId === "string" ? params.libraryId : "",
          params.filters
        );
      case "getPageUrl":
        return extension.getPageUrl(
          typeof params.chapterId === "string" ? params.chapterId : "",
          typeof params.page === "number" ? params.page : 1
        );
      case "getDownloadUrl":
        return extension.getDownloadUrl(
          typeof params.chapterId === "string" ? params.chapterId : ""
        );
      case "getReadProgress":
        return extension.getReadProgress?.(
          typeof params.chapterId === "string" ? params.chapterId : ""
        );
      case "updateReadProgress":
        return extension.updateReadProgress?.(
          typeof params.chapterId === "string" ? params.chapterId : "",
          params.progress
        );
      default:
        break;
    }
    throw new Error(`Unknown method: ${message.method}`);
  };
})();
