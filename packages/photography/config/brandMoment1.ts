import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 3009,
        height: 3189,
      },
      focalPoint: {
        x: 1504.5,
        y: 1594.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 768,
          width: 1473,
          height: 3189,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 290,
          left: 493,
          width: 2137,
          height: 2899,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 534,
          left: 0,
          width: 3009,
          height: 1693,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
