/**
 * Метрики Prometheus для nginx из stub_status.
 *
 * Обработчик для js_content: делает внутренний subrequest к location
 * со stub_status, разбирает ответ и отдаёт метрики текстом.
 */
import prometheus from './prometheus.js';

// Location со stub_status. Объявляется с internal: subrequest из njs
// является внутренним запросом, снаружи location недоступен
const STUB_STATUS_URI = '/stub_status';

// Текущие значения
const nginx_connections_active = prometheus.gauge(
  'nginx_connections_active',
  'Active client connections'
);

const nginx_connections_reading = prometheus.gauge(
  'nginx_connections_reading',
  'Connections where nginx is reading the request header'
);

const nginx_connections_writing = prometheus.gauge(
  'nginx_connections_writing',
  'Connections where nginx is writing the response back to the client'
);

const nginx_connections_waiting = prometheus.gauge(
  'nginx_connections_waiting',
  'Idle client connections waiting for a request'
);

// Накопительные счётчики с момента запуска nginx
const nginx_connections_accepted_total = prometheus.counter(
  'nginx_connections_accepted_total',
  'Total number of accepted client connections'
);

const nginx_connections_handled_total = prometheus.counter(
  'nginx_connections_handled_total',
  'Total number of handled connections'
);

const nginx_requests_total = prometheus.counter(
  'nginx_requests_total',
  'Total number of client requests'
);

// accepted всегда >= handled; разница - соединения, которые nginx принял,
// но не смог обработать (исчерпан worker_connections и т.п.)
const nginx_connections_dropped_total = prometheus.counter(
  'nginx_connections_dropped_total',
  'Total number of dropped connections (accepted - handled)'
);

// Разбор текста stub_status:
//   Active connections: 291
//   server accepts handled requests
//    16630948 16630948 31070465
//   Reading: 6 Writing: 179 Waiting: 106
function parseStubStatus(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid stub_status response: empty or not a string');
  }

  const allLines = text.split('\n');
  const lines = [];
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim().length > 0) {
      lines.push(allLines[i]);
    }
  }

  if (lines.length < 4) {
    throw new Error('Invalid stub_status response: insufficient lines');
  }

  const result = {};

  const activeMatch = lines[0].match(/Active connections:\s+(\d+)/);
  if (activeMatch) {
    result.active = parseInt(activeMatch[1], 10);
  } else {
    throw new Error('Failed to parse active connections');
  }

  let countersMatch = null;
  for (let j = 0; j < lines.length; j++) {
    countersMatch = lines[j].match(/\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (countersMatch) {
      break;
    }
  }

  if (countersMatch) {
    result.accepted = parseInt(countersMatch[1], 10);
    result.handled = parseInt(countersMatch[2], 10);
    result.requests = parseInt(countersMatch[3], 10);
  } else {
    throw new Error('Failed to parse connection counters');
  }

  const statusMatch = text.match(/Reading:\s+(\d+)\s+Writing:\s+(\d+)\s+Waiting:\s+(\d+)/);
  if (statusMatch) {
    result.reading = parseInt(statusMatch[1], 10);
    result.writing = parseInt(statusMatch[2], 10);
    result.waiting = parseInt(statusMatch[3], 10);
  } else {
    throw new Error('Failed to parse connection status');
  }

  return result;
}

async function collect(r) {
  try {
    const res = await r.subrequest(STUB_STATUS_URI);

    if (res.status !== 200) {
      r.error('Failed to fetch stub_status: ' + res.status);
      r.return(500, 'Internal Server Error\n');
      return;
    }

    const stats = parseStubStatus(res.responseText);

    nginx_connections_active.set(stats.active);
    nginx_connections_reading.set(stats.reading);
    nginx_connections_writing.set(stats.writing);
    nginx_connections_waiting.set(stats.waiting);

    nginx_connections_accepted_total.set(stats.accepted);
    nginx_connections_handled_total.set(stats.handled);
    nginx_requests_total.set(stats.requests);
    nginx_connections_dropped_total.set(Math.max(0, stats.accepted - stats.handled));

    r.headersOut['Content-Type'] = 'text/plain; version=0.0.4; charset=utf-8';
    r.return(200, prometheus.compile(
      nginx_connections_active,
      nginx_connections_reading,
      nginx_connections_writing,
      nginx_connections_waiting,
      nginx_connections_accepted_total,
      nginx_connections_handled_total,
      nginx_requests_total,
      nginx_connections_dropped_total
    ));
  } catch (e) {
    r.error('Error in metrics handler: ' + e);
    r.return(500, 'Internal Server Error\n');
  }
}

export default collect;
