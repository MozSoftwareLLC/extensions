"use strict";
(() => {
  // extensions/kavita/src/index.ts
  async function bridgeFetch(url, method = "GET", body) {
    const params = { url, method };
    if (body !== void 0) {
      params.body = body;
    }
    return await window.bridge.request("fetch", params);
  }
  function getKavitaSeriesCoverUrl(seriesId) {
    return `/api/Image/series-cover?seriesId=${encodeURIComponent(seriesId)}`;
  }
  function getKavitaChapterCoverUrl(chapterId) {
    return `/api/Image/chapter-cover?chapterId=${encodeURIComponent(chapterId)}`;
  }
  var KAVITA_UNKNOWN_LAST_READ = (/* @__PURE__ */ new Date(0)).toISOString();
  var KAVITA_SENTINEL_CHAPTER = -1e5;
  var KAVITA_SERIES_FILTER_FIELD = {
    SERIES_NAME: 1,
    LIBRARIES: 19,
    FILE_PATH: 25
  };
  var KAVITA_FILTER_COMPARISON = {
    CONTAINS: 5,
    MATCHES: 7
  };
  var KAVITA_FILTER_COMBINATION = {
    AND: 1
  };
  var KAVITA_FILTER_ENTITY_TYPE = {
    SERIES: 0
  };
  var KAVITA_SERIES_SORT_FIELD = {
    SORT_NAME: 1
  };
  var KAVITA_SEARCH_PAGE_SIZE = 100;
  var KAVITA_SEARCH_MAX_PAGES = 3;
  function sanitizeFilenameToTitle(filePath) {
    if (!filePath) return void 0;
    const normalizedPath = filePath.replace(/\\/g, "/");
    const basename = normalizedPath.split("/").pop()?.trim();
    if (!basename) return void 0;
    const withoutExtension = basename.replace(/\.[a-z0-9]+$/i, "");
    const title = withoutExtension.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    return title || void 0;
  }
  function classifyFilePath(filePath) {
    if (!filePath) return "unknown";
    const normalizedPath = filePath.replace(/\\/g, "/").split(/[?#]/)[0];
    const basename = normalizedPath.split("/").pop()?.trim().toLowerCase() ?? "";
    const extensionMatch = basename.match(/\.([a-z][a-z0-9]{1,7})$/);
    if (!extensionMatch) {
      return "unknown";
    }
    const extension2 = extensionMatch[1];
    return extension2 === "epub" || extension2 === "pdf" ? "supported" : "unsupported";
  }
  function isAllowedFilePath(filePath) {
    return classifyFilePath(filePath) !== "unsupported";
  }
  function chooseChapterFilePath(files) {
    if (!Array.isArray(files)) {
      return { include: true };
    }
    const filePaths = files.map((file) => isRecord(file) && typeof file.filePath === "string" ? file.filePath : null).filter((filePath) => Boolean(filePath));
    if (filePaths.length === 0) {
      return { include: true };
    }
    const supportedFilePath = filePaths.find(
      (filePath) => classifyFilePath(filePath) === "supported"
    );
    if (supportedFilePath) {
      return { include: true, filePath: supportedFilePath };
    }
    const unknownFilePath = filePaths.find(
      (filePath) => classifyFilePath(filePath) === "unknown"
    );
    if (unknownFilePath) {
      return { include: true, filePath: unknownFilePath };
    }
    return { include: false };
  }
  function isRecord(value) {
    return value !== null && typeof value === "object";
  }
  function getKavitaSearchResultTitle(result) {
    const title = [
      result.name,
      result.localizedName,
      result.originalName,
      result.sortName
    ].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
    return title?.trim() ?? null;
  }
  function getKavitaListingMetadata(libraryId, libraryName) {
    const metadata = {};
    if (typeof libraryId === "number" && Number.isFinite(libraryId)) {
      metadata.libraryId = String(libraryId);
    }
    if (typeof libraryName === "string" && libraryName.trim().length > 0) {
      metadata.libraryName = libraryName.trim();
    }
    return Object.keys(metadata).length > 0 ? metadata : void 0;
  }
  function createKavitaListingItem(seriesId, title, metadata) {
    return {
      id: seriesId,
      title,
      coverUrl: getKavitaSeriesCoverUrl(seriesId),
      ...metadata ? { metadata } : {}
    };
  }
  function parseKavitaSearchSeries(rawSeries) {
    return rawSeries.flatMap((series) => {
      const rawSeriesId = series.seriesId ?? series.id;
      if (typeof rawSeriesId !== "number" || !Number.isFinite(rawSeriesId)) {
        return [];
      }
      const title = getKavitaSearchResultTitle(series);
      if (!title) {
        return [];
      }
      const seriesId = String(rawSeriesId);
      return [createKavitaListingItem(
        seriesId,
        title,
        getKavitaListingMetadata(series.libraryId, series.libraryName)
      )];
    });
  }
  function parseKavitaSeriesDtosToListingItems(rawSeries) {
    return rawSeries.flatMap((series) => {
      if (typeof series.id !== "number" || !Number.isFinite(series.id)) {
        return [];
      }
      const title = getKavitaSearchResultTitle(series);
      if (!title) {
        return [];
      }
      const seriesId = String(series.id);
      return [createKavitaListingItem(
        seriesId,
        title,
        getKavitaListingMetadata(series.libraryId, series.libraryName)
      )];
    });
  }
  function dedupeListingItemsById(items) {
    const seenIds = /* @__PURE__ */ new Set();
    return items.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
  }
  function createKavitaSeriesFilterBody(field, value) {
    return {
      statements: [
        {
          field,
          comparison: KAVITA_FILTER_COMPARISON.MATCHES,
          value
        }
      ],
      combination: KAVITA_FILTER_COMBINATION.AND,
      sortOptions: {
        sortField: KAVITA_SERIES_SORT_FIELD.SORT_NAME,
        isAscending: true
      },
      entityType: KAVITA_FILTER_ENTITY_TYPE.SERIES,
      limitTo: 0
    };
  }
  function parsePaginationHeader(headerValue) {
    if (!headerValue) return null;
    try {
      const parsed = JSON.parse(headerValue);
      return {
        currentPage: parsed.currentPage,
        itemsPerPage: parsed.itemsPerPage,
        totalItems: parsed.totalItems,
        totalPages: parsed.totalPages
      };
    } catch {
      return null;
    }
  }
  function normalizeKavitaVolumesResponse(raw) {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (!isRecord(raw)) {
      return [];
    }
    const wrappedVolumeKeys = ["volumes", "items", "content"];
    for (const key of wrappedVolumeKeys) {
      const value = raw[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    if (Array.isArray(raw.chapters)) {
      return [raw];
    }
    return [];
  }
  function getKavitaChapterId(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }
  function flattenVolumesToChapters(volumes) {
    if (!Array.isArray(volumes)) {
      return [];
    }
    return volumes.flatMap((vol) => {
      if (!isRecord(vol) || !Array.isArray(vol.chapters)) {
        return [];
      }
      const volumeNumber = typeof vol.number === "number" && Number.isFinite(vol.number) ? vol.number : void 0;
      return vol.chapters.flatMap((ch) => {
        if (!isRecord(ch)) {
          return [];
        }
        const chapterId = getKavitaChapterId(ch.id);
        if (!chapterId) {
          return [];
        }
        const rawNumber = ch.number;
        const parsedNumber = typeof rawNumber === "string" ? parseFloat(rawNumber) : rawNumber;
        const chapterNumber = typeof parsedNumber === "number" && Number.isFinite(parsedNumber) ? parsedNumber : void 0;
        const isSentinel = parsedNumber === KAVITA_SENTINEL_CHAPTER;
        const rawTitle = typeof ch.title === "string" ? ch.title : "";
        const hasValidTitle = rawTitle.trim() !== "" && !rawTitle.includes(String(KAVITA_SENTINEL_CHAPTER));
        const fileSelection = chooseChapterFilePath(ch.files);
        if (!fileSelection.include) {
          return [];
        }
        const filePath = fileSelection.filePath;
        const filenameTitle = sanitizeFilenameToTitle(filePath);
        const title = hasValidTitle ? rawTitle : isSentinel ? filenameTitle || (typeof vol.name === "string" && vol.name.trim().length > 0 ? vol.name : volumeNumber === void 0 ? "Volume" : `Volume ${volumeNumber}`) : `Chapter ${rawNumber}`;
        return {
          id: chapterId,
          title,
          coverUrl: getKavitaChapterCoverUrl(chapterId),
          number: isSentinel ? void 0 : chapterNumber,
          volume: volumeNumber,
          filePath
        };
      });
    });
  }
  var extension = {
    id: "server-kavita",
    name: "Kavita Server",
    version: "1.0.10",
    type: "server",
    serverType: "kavita",
    async activate(_config) {
    },
    async deactivate() {
    },
    async testConnection() {
      try {
        const response = await bridgeFetch("/api/health", "GET");
        if (response.status === 200) return true;
        const fallback = await bridgeFetch("/api/Server/server-info", "GET");
        return fallback.status === 200;
      } catch {
        return false;
      }
    },
    async getLibraries() {
      const response = await bridgeFetch("/api/Library/libraries", "GET");
      const data = JSON.parse(response.body);
      return data.map((lib) => ({ id: String(lib.id), name: lib.name }));
    },
    async getSeries(libraryId, filters) {
      const page = filters?.page ?? 1;
      const pageSize = filters?.pageSize ?? 20;
      const filterBody = {
        statements: [
          {
            field: KAVITA_SERIES_FILTER_FIELD.LIBRARIES,
            comparison: KAVITA_FILTER_COMPARISON.CONTAINS,
            value: libraryId
          }
        ],
        combination: 1,
        sortOptions: { sortField: 1, isAscending: true },
        limitTo: 0
      };
      const response = await bridgeFetch(
        `/api/Series/v2?PageNumber=${page}&PageSize=${pageSize}`,
        "POST",
        JSON.stringify(filterBody)
      );
      const series = JSON.parse(response.body);
      const pagination = parsePaginationHeader(response.headers["pagination"]);
      const items = series.map((s) => ({
        id: String(s.id),
        title: s.name,
        coverUrl: getKavitaSeriesCoverUrl(String(s.id)),
        libraryId: String(s.libraryId)
      }));
      if (!pagination) {
        return { items, page, totalPages: 1, hasNextPage: false };
      }
      return {
        items,
        page: pagination.currentPage,
        totalPages: pagination.totalPages,
        hasNextPage: pagination.currentPage < pagination.totalPages
      };
    },
    async fetchChapters(seriesId) {
      const response = await bridgeFetch(
        `/api/Series/volumes?seriesId=${seriesId}`,
        "GET"
      );
      const volumes = normalizeKavitaVolumesResponse(JSON.parse(response.body));
      return flattenVolumesToChapters(volumes);
    },
    async search(query) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        return [];
      }
      const searchSeriesByFilter = async (field) => {
        const filterBody = createKavitaSeriesFilterBody(field, normalizedQuery);
        const results = [];
        let page = 1;
        let hasNextPage = true;
        while (hasNextPage && page <= KAVITA_SEARCH_MAX_PAGES) {
          const response = await bridgeFetch(
            `/api/Series/v2?PageNumber=${page}&PageSize=${KAVITA_SEARCH_PAGE_SIZE}`,
            "POST",
            JSON.stringify(filterBody)
          );
          const series = JSON.parse(response.body);
          results.push(...parseKavitaSeriesDtosToListingItems(series));
          const pagination = parsePaginationHeader(response.headers["pagination"]);
          hasNextPage = pagination !== null && pagination.currentPage < pagination.totalPages;
          page += 1;
        }
        return dedupeListingItemsById(results);
      };
      const resolveSeriesResult = async (url) => {
        const response = await bridgeFetch(url, "GET");
        if (!response.body) {
          return [];
        }
        const series = JSON.parse(response.body);
        if (!series) {
          return [];
        }
        return parseKavitaSeriesDtosToListingItems([series]);
      };
      const searchGlobalAndResolve = async () => {
        const response = await bridgeFetch(
          `/api/Search/search?includeChapterAndFiles=true&queryString=${encodeURIComponent(normalizedQuery)}`,
          "GET"
        );
        const parsed = JSON.parse(response.body);
        const data = isRecord(parsed) ? parsed : {};
        const directSeries = parseKavitaSearchSeries(
          Array.isArray(data.series) ? data.series : []
        );
        const fileResolverPromises = (Array.isArray(data.files) ? data.files : []).filter((file) => typeof file.id === "number" && Number.isFinite(file.id) && isAllowedFilePath(file.filePath)).map((file) => resolveSeriesResult(
          `/api/Search/series-for-mangafile?mangaFileId=${file.id}`
        ));
        const chapterResolverPromises = (Array.isArray(data.chapters) ? data.chapters : []).filter((chapter) => typeof chapter.id === "number" && Number.isFinite(chapter.id)).map((chapter) => resolveSeriesResult(
          `/api/Search/series-for-chapter?chapterId=${chapter.id}`
        ));
        const resolvedResults = await Promise.allSettled([
          ...fileResolverPromises,
          ...chapterResolverPromises
        ]);
        const resolvedSeries = resolvedResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        return dedupeListingItemsById([
          ...directSeries,
          ...resolvedSeries
        ]);
      };
      const seriesNameResults = await searchSeriesByFilter(
        KAVITA_SERIES_FILTER_FIELD.SERIES_NAME
      );
      if (seriesNameResults.length > 0) {
        return seriesNameResults;
      }
      const filePathResults = await searchSeriesByFilter(
        KAVITA_SERIES_FILTER_FIELD.FILE_PATH
      );
      if (filePathResults.length > 0) {
        return filePathResults;
      }
      return searchGlobalAndResolve();
    },
    async fetchListing(page) {
      const pageNum = page ?? 1;
      const filterBody = {
        statements: [],
        combination: 1,
        sortOptions: { sortField: 1, isAscending: true },
        limitTo: 0
      };
      const response = await bridgeFetch(
        `/api/Series/v2?PageNumber=${pageNum}&PageSize=20`,
        "POST",
        JSON.stringify(filterBody)
      );
      const series = JSON.parse(response.body);
      const pagination = parsePaginationHeader(response.headers["pagination"]);
      const items = series.map((s) => ({
        id: String(s.id),
        title: s.name,
        coverUrl: getKavitaSeriesCoverUrl(String(s.id))
      }));
      if (!pagination) {
        return { items, page: pageNum, totalPages: 1, hasNextPage: false };
      }
      return {
        items,
        page: pagination.currentPage,
        totalPages: pagination.totalPages,
        hasNextPage: pagination.currentPage < pagination.totalPages
      };
    },
    getPageUrl(chapterId, page) {
      return `/api/Reader/image?chapterId=${encodeURIComponent(chapterId)}&page=${page}`;
    },
    getDownloadUrl(chapterId) {
      return `/api/Download/chapter?chapterId=${encodeURIComponent(chapterId)}`;
    },
    async getReadProgress(chapterId) {
      try {
        const response = await bridgeFetch(
          `/api/Reader/progress?chapterId=${chapterId}`,
          "GET"
        );
        const data = JSON.parse(response.body);
        return {
          page: data.pageNum,
          totalPages: 0,
          percentage: 0,
          lastRead: KAVITA_UNKNOWN_LAST_READ
        };
      } catch {
        return null;
      }
    },
    async updateReadProgress(chapterId, progress) {
      await bridgeFetch(
        "/api/Reader/progress",
        "POST",
        JSON.stringify({
          chapterId: parseInt(chapterId, 10),
          pageNum: progress.page,
          lastModified: progress.lastRead
        })
      );
    },
    getSettings() {
      return {};
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
