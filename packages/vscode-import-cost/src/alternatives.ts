export const ALTERNATIVES: Record<string, { to: string; reason: string }> = {
  moment: {
    to: 'dayjs',
    reason: 'dayjs has the same API at ~2KB vs ~300KB',
  },
  'moment-timezone': {
    to: 'dayjs + dayjs/plugin/timezone',
    reason: 'dayjs timezone plugin is much smaller',
  },
  lodash: {
    to: 'lodash-es or individual imports (lodash/pick)',
    reason:
      'lodash-es is tree-shakeable, individual imports avoid bundling the whole library',
  },
  underscore: {
    to: 'lodash-es or native JS methods',
    reason: 'most underscore utilities have native equivalents',
  },
  axios: {
    to: 'ky or native fetch',
    reason: 'ky is ~3KB, native fetch is built-in',
  },
  'node-fetch': {
    to: 'native fetch (Node 18+)',
    reason: 'fetch is built into Node.js 18+',
  },
  uuid: {
    to: 'crypto.randomUUID()',
    reason: 'built into Node 19+ and all modern browsers',
  },
  'class-names': {
    to: 'clsx',
    reason: 'clsx is a smaller drop-in replacement',
  },
  classnames: {
    to: 'clsx',
    reason: 'clsx is a smaller drop-in replacement (~0.5KB vs ~1.5KB)',
  },
  'date-fns': {
    to: 'individual date-fns/* imports',
    reason: 'import only the functions you use for smaller bundles',
  },
  'react-icons': {
    to: 'individual icon pack imports (react-icons/fi)',
    reason: 'importing from the root bundles all icon packs',
  },
  'aws-sdk': {
    to: '@aws-sdk/* (v3 modular)',
    reason: 'AWS SDK v3 is modular — import only the clients you need',
  },
  '@fortawesome/fontawesome-svg-core': {
    to: 'individual icon imports',
    reason: 'import only the icons you use instead of the full library',
  },
  bluebird: {
    to: 'native Promise',
    reason: 'native Promise is now fast enough for most use cases',
  },
  'core-js': {
    to: 'core-js/actual/* or native APIs',
    reason:
      'import only the polyfills you need or use browserslist-based injection',
  },
  rxjs: {
    to: 'rxjs/* deep imports',
    reason: 'import operators individually: rxjs/operators/map',
  },
};
