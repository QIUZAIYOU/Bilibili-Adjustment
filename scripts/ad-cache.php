<?php
/**
 * 广告识别缓存 API
 * 
 * 共享广告识别结果，避免重复调用大模型 API。
 * 
 * GET  ?bvid=BVxxxxxx        → 查询缓存
 * POST body: {"bvid":"BVxxxx","segments":[{"start":120,"end":180,"summary":"..."}]}  → 写入缓存
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
// 负缓存 TTL：空结果（无广告）记录超过该时长后视为未命中，允许后续重新识别（报告 §4.6）
$NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 初始化 SQLite 数据库
function getDB() {
    global $DB_PATH;
    $db = new SQLite3($DB_PATH);
    $db->enableExceptions(true);
    // WAL 模式，提升并发读写性能
    $db->exec('PRAGMA journal_mode=WAL');
    // 写锁竞争时等待而非立刻失败（并发写入排队，报告 §4.6）
    $db->busyTimeout(3000);
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

// bvid 格式校验：支持 BV 格式（普通视频）和纯数字 ep_id（番剧）
function validateBvid($bvid) {
    global $MAX_BVID_LENGTH;
    if (!is_string($bvid) || strlen($bvid) > $MAX_BVID_LENGTH || strlen($bvid) < 1) {
        return false;
    }
    // BV 格式：BV 开头 + 至少 8 位字母数字（总长 ≥ 10）
    if (preg_match('/^BV[a-zA-Z0-9]+$/', $bvid) === 1 && strlen($bvid) >= 10) {
        return true;
    }
    // 数字格式：纯数字 ep_id（番剧页使用）
    if (preg_match('/^\d+$/', $bvid) === 1) {
        return true;
    }
    return false;
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
    // 负缓存 TTL：空结果记录过期后视为未命中，允许重新识别并覆盖（报告 §4.6）
    $lastUpdated = $row['last_updated'] ? (int)$row['last_updated'] : (int)$row['timestamp'];
    if (is_array($segments) && count($segments) === 0 && (round(microtime(true) * 1000) - $lastUpdated) > $NEGATIVE_CACHE_TTL_MS) {
        http_response_code(200);
        echo json_encode(['ok' => false, 'error' => 'Cache expired (negative)']);
        exit;
    }
    echo json_encode([
        'ok' => true,
        'data' => [
            'bvid' => $bvid,
            'segments' => $segments,
            'timestamp' => (int)$row['timestamp'],
            'uploader_uid' => $row['uploader_uid'] ? (int)$row['uploader_uid'] : null,
            'verified_by' => $verifiedBy,
            'version' => (int)($row['version'] ?? 1),
            'last_updated' => $lastUpdated,
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
    
    // 校验每个 segment 的格式（summary 为可选字段：广告内容简明总结）
    foreach ($segments as $seg) {
        if (!is_array($seg)) {
            http_response_code(400);
            echo json_encode(['error' => 'segment must be an object']);
            exit;
        }
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
        if (isset($seg['summary']) && !is_string($seg['summary'])) {
            http_response_code(400);
            echo json_encode(['error' => 'segment summary must be a string']);
            exit;
        }
    }
    
    $timestamp = time() * 1000;
    $uploaderUid = isset($input['uploader_uid']) && is_numeric($input['uploader_uid']) ? (int)$input['uploader_uid'] : null;
    $verifiedBy = isset($input['verified_by']) && is_array($input['verified_by']) ? json_encode($input['verified_by']) : '[]';
    $version = isset($input['version']) && is_numeric($input['version']) ? (int)$input['version'] : 1;
    $lastUpdated = isset($input['last_updated']) && is_numeric($input['last_updated']) ? (int)$input['last_updated'] : $timestamp;
    $locked = isset($input['locked']) ? (int)$input['locked'] : 0;
    // 并发写排队 + 原子「读现值 → 校验 → 覆盖」（BEGIN IMMEDIATE 保证同一时刻单一写者，报告 §4.6）
    try {
        $db->exec('BEGIN IMMEDIATE');
        $stmt = $db->prepare('SELECT uploader_uid, version, locked FROM ad_cache WHERE bvid = :bvid');
        $stmt->bindValue(':bvid', $bvid, SQLITE3_TEXT);
        $existing = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
        if ($existing) {
            $existingUploader = $existing['uploader_uid'] !== null ? (int)$existing['uploader_uid'] : null;
            $existingVersion = (int)($existing['version'] ?? 1);
            $existingLocked = (int)($existing['locked'] ?? 0);
            // 锁定保护：非上传者不得改写已锁定缓存（服务端强制，客户端校验不可信）
            if ($existingLocked === 1 && $existingUploader !== null && $uploaderUid !== $existingUploader) {
                $db->exec('ROLLBACK');
                http_response_code(423);
                echo json_encode(['ok' => false, 'error' => 'Cache locked by uploader']);
                exit;
            }
            // 版本冲突：提交版本低于现有版本 → 拒绝回退覆盖，客户端应基于最新缓存重试
            if ($version < $existingVersion) {
                $db->exec('ROLLBACK');
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'Version conflict', 'current_version' => $existingVersion]);
                exit;
            }
            // 同版本但提交者不同：说明提交方基于过期副本（并发写）→ 拒绝，避免静默覆盖他人改动。
            // 上传者本人切换 locked 状态时 version 不变且 uid 相同，不受影响。
            if (
                $version === $existingVersion &&
                $existingUploader !== null &&
                $uploaderUid !== null &&
                $uploaderUid !== $existingUploader
            ) {
                $db->exec('ROLLBACK');
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'Stale client version', 'current_version' => $existingVersion]);
                exit;
            }
            // 未登录提交（uid 为空）时保留原上传者归属，避免归属信息被清空
            if ($uploaderUid === null && $existingUploader !== null) {
                $uploaderUid = $existingUploader;
            }
        }
        $segmentsJson = json_encode($segments, JSON_UNESCAPED_UNICODE);
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
        $db->exec('COMMIT');
    } catch (Exception $e) {
        try {
            $db->exec('ROLLBACK');
        } catch (Exception $ignored) {
            // 事务可能已结束，忽略回滚失败
        }
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
        exit;
    }
    
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
