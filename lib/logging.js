'use strict';
const entries = []; let sequence = 0;
function log(level, message) {
  const entry = { id: ++sequence, time: new Date().toISOString(), level, message: String(message) };
  entries.push(entry); if (entries.length > 500) entries.shift();
  (level === 'error' ? console.error : console.log)(`[${entry.time}] ${level.toUpperCase()} ${entry.message}`);
}
module.exports = { log, readLogs: () => [...entries] };
