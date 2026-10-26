/**
 * Минимальный формат экспозиции Prometheus для njs.
 *
 * Ограничения:
 *   - один сэмпл на метрику: значение и набор меток задаются через set();
 *   - состояние не накапливается между запросами: njs создаёт новую копию VM
 *     на каждый запрос, поэтому значения всегда берутся из источника целиком
 *     (stub_status) и выставляются через set(). Методов inc/dec нет намеренно.
 */

// Экранирование значения метки по формату экспозиции
function escapeLabelValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// Экранирование текста HELP
function escapeHelp(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n');
}

function createMetric(type, name, help) {
  return {
    name: name,
    type: type,
    help: help || '',
    value: 0,
    labels: {},

    // Выставить значение и, при необходимости, метки
    set: function (value, labels) {
      this.value = value;
      if (labels) {
        this.labels = labels;
      }
      return this;
    },

    // Текст одной метрики: HELP, TYPE и сэмпл
    compile: function () {
      const keys = Object.keys(this.labels);
      let sample = this.name;

      if (keys.length > 0) {
        const parts = keys.map((k) => k + '="' + escapeLabelValue(this.labels[k]) + '"');
        sample += '{' + parts.join(',') + '}';
      }

      const lines = [];
      if (this.help) {
        lines.push('# HELP ' + this.name + ' ' + escapeHelp(this.help));
      }
      lines.push('# TYPE ' + this.name + ' ' + this.type);
      lines.push(sample + ' ' + String(this.value));

      return lines.join('\n') + '\n';
    }
  };
}

export default {
  gauge: (name, help) => createMetric('gauge', name, help),
  counter: (name, help) => createMetric('counter', name, help),

  // Текст всех метрик, семейства разделены пустой строкой
  compile: (...metrics) => metrics.map((m) => m.compile()).join('\n')
};
