import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProcessedImage } from '../memory/memoryTypes';
import {
  cloudSaveErrorKind,
  cloudSaveErrorReason,
  cloudSyncSignature,
  findLockedUnsyncedCloudSaveCandidates,
  isCloudSaveEligible,
  mergeCloudLoadedImages,
} from './cloudSync';

function memory(id: number, cloudId?: string): ProcessedImage {
  return {
    id,
    cloudId,
    processedImage: null,
    lat: 0,
    lng: 0,
    width: 1,
    height: 1,
    isGenerating: false,
    contentBounds: { x: 0, y: 0, width: 1, height: 1 },
    photos: [],
    audioEntries: [],
    log: {
      location: '',
      date: '',
      partner: '',
      moon: '',
      musings: '',
    },
  };
}

function saveableMemory(id: number, cloudId?: string): ProcessedImage {
  return {
    ...memory(id, cloudId),
    isLocked: true,
    processedImage: { src: 'processed.png' },
  };
}

describe('mergeCloudLoadedImages', () => {
  it('keeps local unsynced buildings when cloud data is pulled after login', () => {
    const localDraft = memory(1);
    const staleCloudBackedLocal = memory(2, 'cloud-old');
    const cloudLoaded = memory(3, 'cloud-new');

    const merged = mergeCloudLoadedImages([localDraft, staleCloudBackedLocal], [cloudLoaded]);

    assert.deepEqual(
      merged.map((item) => item.id),
      [3, 1]
    );
  });
});

describe('cloudSaveErrorKind', () => {
  it('classifies missing auth failures so the UI can show a login prompt', () => {
    assert.equal(
      cloudSaveErrorKind(new Error('Login required before saving memories.')),
      'auth'
    );
    assert.equal(cloudSaveErrorKind(new Error('Usage quota failed (401)')), 'auth');
  });

  it('returns a concise user-facing reason for generic save errors', () => {
    const reason = cloudSaveErrorReason(new Error('StorageApiError: bucket not found'), 12);

    assert.equal(reason, 'StorageApiE...');
  });
});

describe('findLockedUnsyncedCloudSaveCandidates', () => {
  it('finds locked generated buildings that still need an initial cloud save', () => {
    const unsynced = saveableMemory(1);
    const cloudBacked = saveableMemory(2, 'cloud-2');
    const unlocked = { ...saveableMemory(3), isLocked: false };
    const generating = { ...saveableMemory(4), isGenerating: true };
    const noProcessedImage = { ...saveableMemory(5), processedImage: null };

    const candidates = findLockedUnsyncedCloudSaveCandidates(
      [unsynced, cloudBacked, unlocked, generating, noProcessedImage],
      new Map()
    );

    assert.deepEqual(
      candidates.map((item) => item.id),
      [1]
    );
  });

  it('does not retry the same local building signature repeatedly', () => {
    const unsynced = saveableMemory(1);
    const attempted = new Map([[1, cloudSyncSignature(unsynced) ?? '']]);

    const candidates = findLockedUnsyncedCloudSaveCandidates([unsynced], attempted);

    assert.deepEqual(candidates, []);
  });
});

describe('isCloudSaveEligible', () => {
  it('requires lock even when the building already has a cloud id', () => {
    const unlockedCloudImage = { ...saveableMemory(1, 'cloud-1'), isLocked: false };

    assert.equal(isCloudSaveEligible(unlockedCloudImage), false);
  });
});
