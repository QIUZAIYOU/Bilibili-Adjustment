<?php
/**
 * 广告识别缓存 API
 * 
 * 共享广告识别结果，避免重复调用大模型 API。
 * 
 * GET  ?bvid=BVxxxxxx        → 查询缓存
 * POST body: {"bvid":"BVxxxx","segments":[{"start":120,"end":180}]}  → 写入缓存
 * 
 * 数据存储：SQLite（ad-cache.db）
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 配置
$DB_PATH = __DIR__ . '/ad-cache.db';
$MAX_BVID_LENGTH = 20;
$RATE_LIMIT_MAX = 30;  // 每分钟最多 30 次写入
$RATE_LIMIT_WINDOW = 60;

// 初始化 SQLite 数据库
function getDB() {
    global $DB_PATH;
    $db = new SQLite3($DB_PATH);
    $db->enableExceptions(true);
    // WAL 模式，提升并发读写性能
    $db->exec('PRAGMA journal_mode=WAL');
    // 创建缓存表
    $db->exec('CREATE TABLE IF NOT EXISTS ad_cache (
        bvid TEXT PRIMARY KEY,
        segments TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        uploader_uid INTEGER,
        verified_by TEXT,
        version INTEGER DEFAULT 1,
        last_updated INTEGER,
        locked INTEGER DEFAULT 0
    )');
    // 兼容旧表：尝试添加新字段（已存在则忽略）
    $migrations = [
        'ALTER TABLE ad_cache ADD COLUMN uploader_uid INTEGER',
        'ALTER TABLE ad_cache ADD COLUMN verified_by TEXT',
        'ALTER TABLE ad_cache ADD COLUMN version INTEGER DEFAULT 1',
        'ALTER TABLE ad_cache ADD COLUMN last_updated INTEGER',
        'ALTER TABLE ad_cache ADD COLUMN locked INTEGER DEFAULT 0'
    ];
    foreach ($migrations as $sql) {
        try {
            $db->exec($sql);
        } catch (Exception $e) {
            // 字段已存在，忽略错误
        }
    }
    // 创建速率限制表
    $db->exec('CREATE TABLE IF NOT EXISTS rate_limit (
        ip_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start INTEGER NOT NULL
    )');
    return $db;
}

// bvid 格式校验
function validateBvid($bvid) {
    global $MAX_BVID_LENGTH;
    if (!is_string($bvid) || strlen($bvid) > $MAX_BVID_LENGTH || strlen($bvid) < 10) {
        return false;
    }
    return preg_match('/^BV[a-zA-Z0-9]+$/', $bvid) === 1;
}

// 速率限制
function checkRateLimit($db) {
    global $RATE_LIMIT_MAX, $RATE_LIMIT_WINDOW;
    
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = md5($ip);
    $now = time();
    $windowStart = $now - $RATE_LIMIT_WINDOW;
    
    // 清理过期记录
    $db->exec("DELETE FROM rate_limit WHERE window_start < $windowStart");
    
    // 查询当前 IP 的请求次数
    $stmt = $db->prepare('SELECT count, window_start FROM rate_limit WHERE ip_key = :key');
    $stmt->bindValue(':key', $key, SQLITE3_TEXT);
    $result = $stmt->execute();
    $row = $result->fetchArray(SQLITE3_ASSOC);
    
    if ($row) {
        if ($row['count'] >= $RATE_LIMIT_MAX && ($now - $row['window_start']) < $RATE_LIMIT_WINDOW) {
            http_response_code(429);
            echo json_encode(['error' => 'Rate limit exceeded']);
            exit;
        }
        // 更新计数
        if (($now - $row['window_start']) >= $RATE_LIMIT_WINDOW) {
            $stmt = $db->prepare('UPDATE rate_limit SET count = 1, window_start = :time WHERE ip_key = :key');
        } else {
            $stmt = $db->prepare('UPDATE rate_limit SET count = count + 1 WHERE ip_key = :key');
        }
        $stmt->bindValue(':time', $now, SQLITE3_INTEGER);
        $stmt->bindValue(':key', $key, SQLITE3_TEXT);
        $stmt->execute();
    } else {
        $stmt = $db->prepare('INSERT INTO rate_limit (ip_key, count, window_start) VALUES (:key, 1, :time)');
        $stmt->bindValue(':key', $key, SQLITE3_TEXT);
        $stmt->bindValue(':time', $now, SQLITE3_INTEGER);
        $stmt->execute();
    }
}

try {
    $db = getDB();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database init failed']);
    exit;
}

// GET 查询缓存
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $bvid = $_GET['bvid'] ?? '';
    
    if (!validateBvid($bvid)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid bvid format']);
        exit;
    }
    
    $stmt = $db->prepare('SELECT * FROM ad_cache WHERE bvid = :bvid');
    $stmt->bindValue(':bvid', $bvid, SQLITE3_TEXT);
    $result = $stmt->execute();
    $row = $result->fetchArray(SQLITE3_ASSOC);
    
    if (!$row) {
        // 缓存未命中属于正常状态，返回 200 避免浏览器控制台产生 404 网络错误日志
        http_response_code(200);
        echo json_encode(['ok' => false, 'error' => 'Cache miss']);
        exit;
    }
    
    $segments = json_decode($row['segments'], true);
    $verifiedBy = json_decode($row['verified_by'] ?? '[]', true);
    echo json_encode([
        'ok' => true,
        'data' => [
            'bvid' => $bvid,
            'segments' => $segments,
            'timestamp' => (int)$row['timestamp'],
            'uploader_uid' => $row['uploader_uid'] ? (int)$row['uploader_uid'] : null,
            'verified_by' => $verifiedBy,
            'version' => (int)($row['version'] ?? 1),
            'last_updated' => $row['last_updated'] ? (int)$row['last_updated'] : (int)$row['timestamp'],
            'locked' => (int)($row['locked'] ?? 0)
        ]
    ]);
    exit;
}

// POST 写入缓存
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    checkRateLimit($db);
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['bvid']) || !isset($input['segments'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing bvid or segments']);
        exit;
    }
    
    $bvid = $input['bvid'];
    if (!validateBvid($bvid)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid bvid format']);
        exit;
    }
    
    $segments = $input['segments'];
    if (!is_array($segments)) {
        http_response_code(400);
        echo json_encode(['error' => 'segments must be an array']);
        exit;
    }
    
    // 校验每个 segment 的格式
    foreach ($segments as $seg) {
        if (!isset($seg['start']) || !isset($seg['end']) || !is_numeric($seg['start']) || !is_numeric($seg['end'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid segment format, need start and end numbers']);
            exit;
        }
        if ($seg['start'] < 0 || $seg['end'] <= $seg['start']) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid segment time range']);
            exit;
        }
    }
    
    $segmentsJson = json_encode($segments, JSON_UNESCAPED_UNICODE);
    $timestamp = time() * 1000;
    $uploaderUid = isset($input['uploader_uid']) && is_numeric($input['uploader_uid']) ? (int)$input['uploader_uid'] : null;
    $verifiedBy = isset($input['verified_by']) && is_array($input['verified_by']) ? json_encode($input['verified_by']) : '[]';
    $version = isset($input['version']) && is_numeric($input['version']) ? (int)$input['version'] : 1;
    $lastUpdated = isset($input['last_updated']) && is_numeric($input['last_updated']) ? (int)$input['last_updated'] : $timestamp;
    $locked = isset($input['locked']) ? (int)$input['locked'] : 0;
    
    // UPSERT：存在则更新，不存在则插入
    $stmt = $db->prepare('INSERT OR REPLACE INTO ad_cache (bvid, segments, timestamp, uploader_uid, verified_by, version, last_updated, locked) VALUES (:bvid, :segments, :timestamp, :uploader_uid, :verified_by, :version, :last_updated, :locked)');
    $stmt->bindValue(':bvid', $bvid, SQLITE3_TEXT);
    $stmt->bindValue(':segments', $segmentsJson, SQLITE3_TEXT);
    $stmt->bindValue(':timestamp', $timestamp, SQLITE3_INTEGER);
    $stmt->bindValue(':uploader_uid', $uploaderUid, SQLITE3_INTEGER);
    $stmt->bindValue(':verified_by', $verifiedBy, SQLITE3_TEXT);
    $stmt->bindValue(':version', $version, SQLITE3_INTEGER);
    $stmt->bindValue(':last_updated', $lastUpdated, SQLITE3_INTEGER);
    $stmt->bindValue(':locked', $locked, SQLITE3_INTEGER);
    $stmt->execute();
    
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
