import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GALLERY_PAGE_SIZE, paginateGalleryItems } from './galleryPagination';

describe('paginateGalleryItems', () => {
  it('returns eight items per page and reports one trailing empty page', () => {
    const items = Array.from({ length: 17 }, (_, index) => index + 1);

    const pageTwo = paginateGalleryItems(items, 2);
    const pageThree = paginateGalleryItems(items, 3);
    const pageFour = paginateGalleryItems(items, 4);

    assert.equal(GALLERY_PAGE_SIZE, 8);
    assert.equal(pageTwo.pageCount, 4);
    assert.equal(pageTwo.currentPage, 2);
    assert.deepEqual(pageTwo.pageItems, [9, 10, 11, 12, 13, 14, 15, 16]);
    assert.deepEqual(pageThree.pageItems, [17]);
    assert.deepEqual(pageFour.pageItems, []);
  });

  it('clamps page numbers into the valid range', () => {
    const items = Array.from({ length: 9 }, (_, index) => index + 1);

    assert.equal(paginateGalleryItems(items, 0).currentPage, 1);
    assert.equal(paginateGalleryItems(items, 99).currentPage, 3);
  });

  it('keeps empty galleries within the visible page range', () => {
    const result = paginateGalleryItems([], 4);

    assert.equal(result.currentPage, 2);
    assert.equal(result.pageCount, 2);
    assert.deepEqual(result.pageItems, []);
  });
});
