/**
 * Метрики Prometheus для Nginx со stub_status
 */
import prometheus from './prometheus.js';

const metrics = prometheus.new();

// Метрики из stub_status
const nginx_connections_active = metrics.gauge({
  key: 'nginx_connections_active',
  help: 'Active client connections'
});

const nginx_connections_reading = metrics.gauge({
  key: 'nginx_connections_reading',
  help: 'Connections where nginx is reading the request header'
});

const nginx_connections_writing = metrics.gauge({
  key: 'nginx_connections_writing',
  help: 'Connections where nginx is writing the response back to the client'
});

const nginx_connections_waiting = metrics.gauge({
  key: 'nginx_connections_waiting',
  help: 'Idle client connections waiting for a request'
});

const nginx_connections_accepted_total = metrics.counter({
  key: 'nginx_connections_accepted_total',
  help: 'Total number of accepted client connections'
});

const nginx_connections_handled_total = metrics.counter({
  key: 'nginx_connections_handled_total',
  help: 'Total number of handled connections'
});

const nginx_requests_total = metrics.counter({
  key: 'nginx_requests_total',
  help: 'Total number of client requests'
});

// Функция парсинга stub_status
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

  // Active connections: 1
  const activeMatch = lines[0].match(/Active connections:\s+(\d+)/);
  if (activeMatch) {
    result.active = parseInt(activeMatch[1], 10);
  } else {
    throw new Error('Failed to parse active connections');
  }

  // server accepts handled requests
  //  16630948 16630948 31070465
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

  // Reading: 0 Writing: 1 Waiting: 0
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
  const hostname = r.variables.hostname || r.variables.host || 'unknown';

  try {
    // Внутренний subrequest к stub_status
    const res = await r.subrequest('/v1/stub_status');
    
    if (res.status !== 200) {
      r.error('Failed to fetch stub_status: ' + res.status);
      r.return(500, 'Internal Server Error\n');
      return;
    }

    if (!res.responseText) {
      r.error('Empty response from stub_status');
      r.return(500, 'Internal Server Error\n');
      return;
    }

    const stats = parseStubStatus(res.responseText);

    // Метрики соединений (gauge)
    nginx_connections_active
      .set(stats.active || 0)
      .setMetaData({ instance: hostname });

    nginx_connections_reading
      .set(stats.reading || 0)
      .setMetaData({ instance: hostname });

    nginx_connections_writing
      .set(stats.writing || 0)
      .setMetaData({ instance: hostname });

    nginx_connections_waiting
      .set(stats.waiting || 0)
      .setMetaData({ instance: hostname });

    // Счётчики
    nginx_connections_accepted_total
      .set(stats.accepted || 0)
      .setMetaData({ instance: hostname });

    nginx_connections_handled_total
      .set(stats.handled || 0)
      .setMetaData({ instance: hostname });

    nginx_requests_total
      .set(stats.requests || 0)
      .setMetaData({ instance: hostname });

    // Сборка метрик
    r.headersOut['Content-Type'] = 'text/plain; version=0.0.4; charset=utf-8';
    r.return(200, prometheus.compile(
      nginx_connections_active,
      nginx_connections_reading,
      nginx_connections_writing,
      nginx_connections_waiting,
      nginx_connections_accepted_total,
      nginx_connections_handled_total,
      nginx_requests_total
    ));

  } catch (e) {
    r.error('Error in metrics handler: ' + e);
    r.return(500, 'Internal Server Error\n');
  }
};

export default collect;
