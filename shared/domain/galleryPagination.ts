export const GALLERY_PAGE_SIZE = 8;

export type GalleryPaginationResult<T> = {
  currentPage: number;
  pageCount: number;
  pageItems: T[];
  totalItems: number;
};

export function galleryPageCount(totalItems: number, pageSize = GALLERY_PAGE_SIZE): number {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  const filledPageCount = Math.max(1, Math.ceil(Math.max(0, totalItems) / normalizedPageSize));
  return filledPageCount + 1;
}

export function clampGalleryPage(page: number, totalItems: number, pageSize = GALLERY_PAGE_SIZE): number {
  const pageCount = galleryPageCount(totalItems, pageSize);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), pageCount);
}

export function paginateGalleryItems<T>(
  items: readonly T[],
  page: number,
  pageSize = GALLERY_PAGE_SIZE,
): GalleryPaginationResult<T> {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  const currentPage = clampGalleryPage(page, items.length, normalizedPageSize);
  const start = (currentPage - 1) * normalizedPageSize;

  return {
    currentPage,
    pageCount: galleryPageCount(items.length, normalizedPageSize),
    pageItems: items.slice(start, start + normalizedPageSize),
    totalItems: items.length,
  };
}
