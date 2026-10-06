'use strict';
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
let previousCpu = null, previousProcesses = new Map(), snapshot = null, pending = null;
function cpuSample(cpus = os.cpus()) {
  const current = cpus.reduce((sum, cpu) => { sum.idle += cpu.times.idle; sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0); return sum; }, { idle: 0, total: 0 });
  const delta = previousCpu ? current.total - previousCpu.total : 0;
  const usage = delta > 0 ? Math.max(0, Math.min(100, 100 * (1 - (current.idle - previousCpu.idle) / delta))) : null;
  previousCpu = current; return usage;
}
function parsePs(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), cpu: Number(match[3]), memoryPercent: Number(match[4]), memory: Number(match[5]) * 1024, state: match[6], name: match[7].trim(), window: '', handles: null, threads: null }] : [];
  });
}
function windowsSamples(rows, now = Date.now()) {
  const next = new Map();
  const result = rows.map(row => {
    const old = previousProcesses.get(row.Id), total = typeof row.CPU === 'number' ? row.CPU : null;
    const cpu = total !== null && old && old.name === row.ProcessName && total >= old.total && now > old.time ? 100000 * (total - old.total) / (now - old.time) : null;
    if (total !== null) next.set(row.Id, { total, time: now, name: row.ProcessName });
    return { pid: row.Id, name: row.ProcessName, parent: null, cpu, memory: Number(row.WorkingSet64) || 0, state: '', window: row.MainWindowTitle || '', handles: row.Handles ?? null, threads: row.ThreadCount ?? null, cpuSeconds: total };
  });
  previousProcesses = next; return result;
}
async function processes() {
  if (process.platform === 'win32') {
    const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $ErrorActionPreference = 'SilentlyContinue'; @(Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,Handles,MainWindowTitle,@{Name='ThreadCount';Expression={$_.Threads.Count}}) | ConvertTo-Json -Compress";
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    const rows = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]'); return windowsSamples(Array.isArray(rows) ? rows : [rows]);
  }
  const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,pcpu=,pmem=,rss=,stat=,comm='], { timeout: 15000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } });
  return parsePs(stdout);
}
async function collect() {
  const cpus = os.cpus(), total = os.totalmem(), free = os.freemem(); let items = [], processError = null;
  try { items = await processes(); } catch (e) { processError = `Unable to read processes: ${e.message}. ${process.platform === 'win32' ? 'Windows PowerShell' : 'The ps utility'} must be available.`; }
  const result = {
    sampledAt: Date.now(), platform: process.platform, os: os.type(), version: os.version(), release: os.release(), architecture: os.arch(), hostname: os.hostname(), uptime: os.uptime(),
    cpu: { model: cpus[0]?.model || 'Unavailable', cores: cpus.length, usage: cpuSample(cpus), speed: cpus[0]?.speed || 0 },
    memory: { total, free, used: total - free, percent: total ? 100 * (total - free) / total : 0 },
    load: process.platform === 'win32' ? null : os.loadavg(), runtime: { node: process.version, pid: process.pid, memory: process.memoryUsage().rss },
    processes: items, processError, cpuMethod: process.platform === 'win32' ? 'Process CPU is sampled between refreshes; the first sample is unavailable. 100% means one logical CPU core.' : 'Process CPU is reported by ps; averaging differs by OS. 100% means one logical CPU core.',
    network: Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) => (addresses || []).filter(a => !a.internal).map(a => ({ name, address: a.address, family: a.family })))
  };
  snapshot = result; return result;
}
async function systemSnapshot() {
  if (snapshot && Date.now() - snapshot.sampledAt < 1000) return snapshot;
  if (!pending) pending = collect().finally(() => { pending = null; });
  return pending;
}
module.exports = { systemSnapshot, parsePs, windowsSamples, cpuSample };
