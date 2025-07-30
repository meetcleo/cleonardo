import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 7542,
        height: 8192,
      },
      focalPoint: {
        x: 3771,
        y: 4096,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1879,
          width: 3783,
          height: 8192,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 0,
          left: 752,
          width: 6038,
          height: 8192,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 1626,
          left: 0,
          width: 7542,
          height: 4242,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 822,
          width: 5898,
          height: 8192,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
