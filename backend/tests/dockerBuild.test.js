'use strict';

// buildErrorOf: docker build step failures arrive as ordinary stream events
// (error/errorDetail) with a clean stream end — followProgress alone resolves
// them as success (observed live: phantom IMAGE_CREATED, then 404 at start).

const { buildErrorOf } = require('../src/runtime/docker');

describe('docker build error detection', () => {
  test('clean output has no error', () => {
    expect(buildErrorOf([{ stream: 'Step 1/2 : FROM x' }, { stream: 'ok' }])).toBeNull();
    expect(buildErrorOf([])).toBeNull();
    expect(buildErrorOf(null)).toBeNull();
  });

  test('error event detected, message preserved', () => {
    const err = buildErrorOf([
      { stream: 'Step 6/11 : RUN npm run build' },
      { errorDetail: { message: 'The command returned a non-zero code: 1' }, error: 'npm error Missing script' },
    ]);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Missing script');
  });

  test('errorDetail-only event detected', () => {
    const err = buildErrorOf([{ errorDetail: { message: 'boom' } }]);
    expect(err.message).toBe('boom');
  });
});
