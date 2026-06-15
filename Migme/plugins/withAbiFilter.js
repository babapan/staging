const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAbiFilter(config, { abis = 'arm64-v8a' } = {}) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const set = (key, value) => {
      const existing = props.find((it) => it.type === 'property' && it.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };
    set('reactNativeArchitectures', abis);
    return cfg;
  });
};
