'use strict';
const { getDb } = require('./db/sqlite');
const fs = require('fs');
const path = require('path');

const dbJsonPath = path.join(__dirname, '..', 'data', 'db.json');

function getDefaultSettings() {
  return {
    arrowKeysChangeChannel: true,
    overlayDuration: 5,
    defaultVolume: 80,
    rememberVolume: true,
    lastVolume: 80,
    autoPlayNextEpisode: false,
    forceProxy: false,
    forceTranscode: false,
    forceVideoTranscode: false,
    forceRemux: false,
    autoTranscode: true,
    streamFormat: 'm3u8',
    epgRefreshInterval: '24',
    userAgentPreset: 'chrome',
    userAgentCustom: '',
    hwEncoder: 'auto',
    maxResolution: '1080p',
    quality: 'medium',
    audioMixPreset: 'auto',
    probeCacheTTL: 300,
    seriesProbeCacheDays: 7,
    upscaleEnabled: false,
    upscaleMethod: 'hardware',
    upscaleTarget: '1080p'
  };
}

const USER_AGENT_PRESETS = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  vlc: 'VLC/3.0.20 LibVLC/3.0.20',
  tivimate: 'TiviMate/4.7.0',
};

function getUserAgent(settings) {
  if (settings.userAgentPreset === 'custom' && settings.userAgentCustom) {
    return settings.userAgentCustom;
  }
  return USER_AGENT_PRESETS[settings.userAgentPreset] || USER_AGENT_PRESETS.chrome;
}

// ── One-time migration from db.json → SQLite ─────────────────────────────────

function runMigration() {
  if (!fs.existsSync(dbJsonPath)) return;

  const db = getDb();

  if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'migration_v1_done'").get()) {
    // Migration already done; clean up stale file if it somehow reappeared
    try { fs.renameSync(dbJsonPath, dbJsonPath + '.migrated'); } catch {}
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

    db.transaction(() => {
      const insSource = db.prepare(`
        INSERT OR IGNORE INTO sources (id, name, type, url, username, password, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of (data.sources || [])) {
        insSource.run(s.id, s.name, s.type, s.url, s.username ?? null, s.password ?? null,
          s.enabled ? 1 : 0, s.created_at, s.updated_at);
      }

      const insUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, password_hash, role, oidc_id, email, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of (data.users || [])) {
        insUser.run(u.id, u.username, u.passwordHash ?? null, u.role ?? 'viewer',
          u.oidcId ?? null, u.email ?? null, u.createdAt);
      }

      if (data.settings && !db.prepare("SELECT 1 FROM app_settings WHERE key = 'settings'").get()) {
        db.prepare("INSERT INTO app_settings (key, value) VALUES ('settings', ?)").run(
          JSON.stringify({ ...getDefaultSettings(), ...data.settings })
        );
      }

      const insHidden = db.prepare(
        'INSERT OR IGNORE INTO hidden_items (source_id, item_type, item_id) VALUES (?, ?, ?)'
      );
      for (const h of (data.hiddenItems || [])) {
        insHidden.run(h.source_id, h.item_type, h.item_id);
      }

      const insFav = db.prepare(
        'INSERT OR IGNORE INTO legacy_favorites (source_id, item_id, item_type, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const f of (data.favorites || [])) {
        insFav.run(f.source_id, f.item_id, f.item_type, f.created_at || new Date().toISOString());
      }

      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('migration_v1_done', 'true')").run();
    })();

    fs.renameSync(dbJsonPath, dbJsonPath + '.migrated');
    console.log('[DB] Migration from db.json to SQLite completed');
  } catch (err) {
    console.error('[DB] Migration failed:', err);
  }
}

runMigration();

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToSource(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    username: row.username,
    password: row.password,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToUser(row, includeHash = false) {
  const u = {
    id: row.id,
    username: row.username,
    role: row.role,
    oidcId: row.oidc_id,
    email: row.email,
    createdAt: row.created_at,
  };
  if (includeHash) u.passwordHash = row.password_hash;
  return u;
}

// ── Sources ───────────────────────────────────────────────────────────────────

const sources = {
  async getAll() {
    return getDb().prepare('SELECT * FROM sources ORDER BY id').all().map(rowToSource);
  },

  async getById(id) {
    const row = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(parseInt(id));
    return row ? rowToSource(row) : null;
  },

  async getByType(type) {
    return getDb().prepare('SELECT * FROM sources WHERE type = ? AND enabled = 1').all(type).map(rowToSource);
  },

  async create(source) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO sources (name, type, url, username, password, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(source.name, source.type, source.url, source.username ?? null, source.password ?? null, now, now);
    return rowToSource(db.prepare('SELECT * FROM sources WHERE id = ?').get(result.lastInsertRowid));
  },

  async update(id, updates) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(parseInt(id));
    if (!existing) return null;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sources SET name = ?, url = ?, username = ?, password = ?, updated_at = ? WHERE id = ?
    `).run(
      updates.name !== undefined ? updates.name : existing.name,
      updates.url !== undefined ? updates.url : existing.url,
      updates.username !== undefined ? updates.username : existing.username,
      updates.password !== undefined ? updates.password : existing.password,
      now, parseInt(id)
    );
    return rowToSource(db.prepare('SELECT * FROM sources WHERE id = ?').get(parseInt(id)));
  },

  async delete(id) {
    const db = getDb();
    const numId = parseInt(id);
    db.transaction(() => {
      db.prepare('DELETE FROM hidden_items WHERE source_id = ?').run(numId);
      db.prepare('DELETE FROM legacy_favorites WHERE source_id = ?').run(numId);
      db.prepare('DELETE FROM sources WHERE id = ?').run(numId);
    })();
  },

  async toggleEnabled(id) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(parseInt(id));
    if (!existing) return null;
    db.prepare('UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(existing.enabled ? 0 : 1, new Date().toISOString(), parseInt(id));
    return rowToSource(db.prepare('SELECT * FROM sources WHERE id = ?').get(parseInt(id)));
  },
};

// ── Hidden Items ──────────────────────────────────────────────────────────────

const hiddenItems = {
  async getAll(sourceId = null) {
    if (sourceId) {
      return getDb().prepare('SELECT * FROM hidden_items WHERE source_id = ?').all(parseInt(sourceId));
    }
    return getDb().prepare('SELECT * FROM hidden_items').all();
  },

  async hide(sourceId, itemType, itemId) {
    getDb().prepare('INSERT OR IGNORE INTO hidden_items (source_id, item_type, item_id) VALUES (?, ?, ?)')
      .run(parseInt(sourceId), itemType, itemId);
  },

  async show(sourceId, itemType, itemId) {
    getDb().prepare('DELETE FROM hidden_items WHERE source_id = ? AND item_type = ? AND item_id = ?')
      .run(parseInt(sourceId), itemType, itemId);
  },

  async isHidden(sourceId, itemType, itemId) {
    return !!getDb().prepare(
      'SELECT 1 FROM hidden_items WHERE source_id = ? AND item_type = ? AND item_id = ?'
    ).get(parseInt(sourceId), itemType, itemId);
  },

  async bulkHide(items) {
    const db = getDb();
    const ins = db.prepare('INSERT OR IGNORE INTO hidden_items (source_id, item_type, item_id) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const { sourceId, itemType, itemId } of items) ins.run(parseInt(sourceId), itemType, itemId);
    })();
    return true;
  },

  async bulkShow(items) {
    const db = getDb();
    const del = db.prepare('DELETE FROM hidden_items WHERE source_id = ? AND item_type = ? AND item_id = ?');
    db.transaction(() => {
      for (const { sourceId, itemType, itemId } of items) del.run(parseInt(sourceId), itemType, itemId);
    })();
    return true;
  },
};

// ── Legacy Favorites (no user_id; per-user favorites are in sqlite.favorites) ─

const favorites = {
  async getAll(sourceId = null, itemType = null) {
    const db = getDb();
    let sql = 'SELECT * FROM legacy_favorites WHERE 1=1';
    const params = [];
    if (sourceId) { sql += ' AND source_id = ?'; params.push(parseInt(sourceId)); }
    if (itemType) { sql += ' AND item_type = ?'; params.push(itemType); }
    return db.prepare(sql).all(...params);
  },

  async add(sourceId, itemId, itemType = 'channel') {
    getDb().prepare(
      'INSERT OR IGNORE INTO legacy_favorites (source_id, item_id, item_type, created_at) VALUES (?, ?, ?, ?)'
    ).run(parseInt(sourceId), String(itemId), itemType, new Date().toISOString());
    return true;
  },

  async remove(sourceId, itemId, itemType = 'channel') {
    getDb().prepare(
      'DELETE FROM legacy_favorites WHERE source_id = ? AND item_id = ? AND item_type = ?'
    ).run(parseInt(sourceId), String(itemId), itemType);
    return true;
  },

  async isFavorite(sourceId, itemId, itemType = 'channel') {
    return !!getDb().prepare(
      'SELECT 1 FROM legacy_favorites WHERE source_id = ? AND item_id = ? AND item_type = ?'
    ).get(parseInt(sourceId), String(itemId), itemType);
  },
};

// ── Settings ──────────────────────────────────────────────────────────────────

const settings = {
  async get() {
    const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'settings'").get();
    if (!row) return getDefaultSettings();
    return { ...getDefaultSettings(), ...JSON.parse(row.value) };
  },

  async update(newSettings) {
    const db = getDb();
    const current = await settings.get();
    const merged = { ...current, ...newSettings };
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('settings', ?)").run(JSON.stringify(merged));
    return merged;
  },

  async reset() {
    const defaults = getDefaultSettings();
    getDb().prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('settings', ?)").run(JSON.stringify(defaults));
    return defaults;
  },
};

// ── Users ─────────────────────────────────────────────────────────────────────

const users = {
  async getAll() {
    return getDb().prepare('SELECT * FROM users ORDER BY id').all().map(r => rowToUser(r, true));
  },

  async getById(id) {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(parseInt(id));
    return row ? rowToUser(row, true) : null;
  },

  async getByUsername(username) {
    const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
    return row ? rowToUser(row, true) : null;
  },

  async getByOidcId(oidcId) {
    const row = getDb().prepare('SELECT * FROM users WHERE oidc_id = ?').get(oidcId);
    return row ? rowToUser(row, true) : null;
  },

  async getByEmail(email) {
    const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
    return row ? rowToUser(row, true) : null;
  },

  async create(userData) {
    const db = getDb();
    let result;
    try {
      result = db.prepare(`
        INSERT INTO users (username, password_hash, role, oidc_id, email, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userData.username,
        userData.passwordHash ?? null,
        userData.role || 'viewer',
        userData.oidcId ?? null,
        userData.email ?? null,
        new Date().toISOString()
      );
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) throw new Error('Username already exists');
      throw err;
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    return rowToUser(row, false);
  },

  async update(id, updates) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(id));
    if (!existing) throw new Error('User not found');

    if (updates.username && updates.username !== existing.username) {
      if (db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(updates.username, parseInt(id))) {
        throw new Error('Username already exists');
      }
    }

    if (updates.role && updates.role !== 'admin' && existing.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
      if (adminCount <= 1) throw new Error('Cannot remove admin role from the last admin user');
    }

    db.prepare(`
      UPDATE users SET username = ?, password_hash = ?, role = ?, oidc_id = ?, email = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.username ?? existing.username,
      updates.passwordHash !== undefined ? updates.passwordHash : existing.password_hash,
      updates.role ?? existing.role,
      updates.oidcId !== undefined ? updates.oidcId : existing.oidc_id,
      updates.email !== undefined ? updates.email : existing.email,
      new Date().toISOString(),
      parseInt(id)
    );

    return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(id)), false);
  },

  async delete(id) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(id));
    if (!existing) throw new Error('User not found');

    if (existing.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
      if (adminCount <= 1) throw new Error('Cannot delete the last admin user');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(parseInt(id));
    return true;
  },

  async count() {
    return getDb().prepare('SELECT COUNT(*) as c FROM users').get().c;
  },
};

// ── Probe Cache (persisted stream codec/compatibility results) ───────────────

const probeCache = {
  // Returns the cached result if present and newer than ttlMs, else null.
  get(cacheKey, ttlMs) {
    const row = getDb().prepare('SELECT result, created_at FROM probe_cache WHERE cache_key = ?').get(cacheKey);
    if (!row) return null;
    if (ttlMs && Date.now() - row.created_at > ttlMs) return null;
    try { return JSON.parse(row.result); } catch { return null; }
  },

  set(cacheKey, result) {
    getDb().prepare(
      'INSERT OR REPLACE INTO probe_cache (cache_key, result, created_at) VALUES (?, ?, ?)'
    ).run(cacheKey, JSON.stringify(result), Date.now());
  },
};

// ── loadDb / saveDb — compat shims for any remaining callers ─────────────────
// Routes should use the typed APIs above. These shims provide a best-effort
// reconstruction so nothing crashes if called.

async function loadDb() {
  const db = getDb();
  const settingsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'settings'").get();
  return {
    sources: db.prepare('SELECT * FROM sources ORDER BY id').all().map(rowToSource),
    users: db.prepare('SELECT * FROM users ORDER BY id').all().map(r => rowToUser(r, true)),
    hiddenItems: db.prepare('SELECT * FROM hidden_items').all(),
    favorites: db.prepare('SELECT * FROM legacy_favorites').all(),
    settings: settingsRow ? JSON.parse(settingsRow.value) : getDefaultSettings(),
    nextId: (db.prepare('SELECT MAX(id) as m FROM sources').get().m || 0) + 1,
    nextUserId: (db.prepare('SELECT MAX(id) as m FROM users').get().m || 0) + 1,
  };
}

async function saveDb(data) {
  if (!data || !data.users) return;
  const db = getDb();
  const existing = new Map(
    db.prepare('SELECT * FROM users ORDER BY id').all().map(r => [r.id, r])
  );

  db.transaction(() => {
    const seen = new Set();
    for (const u of data.users) {
      seen.add(u.id);
      if (existing.has(u.id)) {
        db.prepare(
          'UPDATE users SET username = ?, password_hash = ?, role = ?, updated_at = ? WHERE id = ?'
        ).run(u.username, u.passwordHash ?? null, u.role, new Date().toISOString(), u.id);
      } else {
        db.prepare(`
          INSERT INTO users (id, username, password_hash, role, oidc_id, email, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(u.id, u.username, u.passwordHash ?? null, u.role || 'viewer',
          u.oidcId ?? null, u.email ?? null, u.createdAt || new Date().toISOString());
      }
    }
    for (const id of existing.keys()) {
      if (!seen.has(id)) db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }
  })();
}

module.exports = {
  loadDb, saveDb,
  sources, hiddenItems, favorites, settings, users, probeCache,
  getDefaultSettings, getUserAgent, USER_AGENT_PRESETS,
};
