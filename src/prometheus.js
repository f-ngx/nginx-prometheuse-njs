/**
 * Модуль для формирования метрик Prometheus (njs)
 */

function formatType(value) {
  if (typeof value === 'string') {
    return '"' + value + '"';
  }
  return String(value);
}

function Prometheus() {
  this.metrics = {};
}

Prometheus.prototype.createMetric = function (param, type) {
  var key = param.key;

  var metric = {
    key: param.key,
    value: param.value || 0,
    help: param.help || '',
    type: type,
    metadata: param.metadata || {},

    set: function (value) {
      this.value = value;
      return this;
    },

    inc: function (value) {
      this.value += (value !== undefined ? value : 1);
      return this;
    },

    dec: function (value) {
      this.value -= (value !== undefined ? value : 1);
      return this;
    },

    setMetaData: function (metadata) {
      this.metadata = metadata;
      return this;
    },

    addMetaData: function (key, value) {
      this.metadata[key] = value;
      return this;
    },

    compile: function () {
      var metricKey = this.key;

      if (this.metadata && Object.keys(this.metadata).length > 0) {
        var metaParts = [];
        for (var k in this.metadata) {
          if (this.metadata.hasOwnProperty(k)) {
            metaParts.push(k + '=' + formatType(this.metadata[k]));
          }
        }
        metricKey = metricKey + '{' + metaParts.join(',') + '}';
      }

      var lines = [];
      if (this.help) {
        lines.push('# HELP ' + this.key + ' ' + this.help);
      }
      lines.push('# TYPE ' + this.key + ' ' + this.type);
      lines.push(metricKey + ' ' + String(this.value));

      return lines.join('\n');
    }
  };

  this.metrics[key] = metric;
  return metric;
};

Prometheus.prototype.gauge = function (param) {
  return this.createMetric(param, 'gauge');
};

Prometheus.prototype.counter = function (param) {
  return this.createMetric(param, 'counter');
};

Prometheus.prototype.histogram = function (param) {
  return this.createMetric(param, 'histogram');
};

Prometheus.prototype.summary = function (param) {
  return this.createMetric(param, 'summary');
};

function compile() {
  var result = [];
  for (var i = 0; i < arguments.length; i++) {
    result.push(arguments[i].compile());
  }
  return result.join('\n\n') + '\n';
}

export default {
  new: function () {
    return new Prometheus();
  },
  compile: compile
};
