'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point the sqlite module at a throwaway DB file before requiring it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-fav-'));
process.env.IPTV_DATA_DIR = tmpDir;

const { favorites } = require('../sqlite');

test('category favorites round-trip and filter by item_type', () => {
  const userId = 1;
  const sourceId = 0; // sentinel for folder favorites
  const name = '|NA| USA MLB';

  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), false);

  assert.equal(favorites.add(userId, sourceId, name, 'category'), true);
  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), true);

  // Adding a channel favorite must not show up under category filter.
  favorites.add(userId, 5, '123', 'channel');
  const cats = favorites.getAll(userId, null, 'category');
  assert.equal(cats.length, 1);
  assert.equal(cats[0].item_id, name);
  assert.equal(cats[0].item_type, 'category');

  assert.equal(favorites.remove(userId, sourceId, name, 'category'), true);
  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), false);
});

test.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });
