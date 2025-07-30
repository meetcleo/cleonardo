import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 5160,
        height: 3009,
      },
      focalPoint: {
        x: 2580,
        y: 1504.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1885,
          width: 1390,
          height: 3009,
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
          left: 1471,
          width: 2218,
          height: 3009,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 1497,
          width: 2166,
          height: 3009,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 53,
          left: 0,
          width: 5160,
          height: 2903,
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
