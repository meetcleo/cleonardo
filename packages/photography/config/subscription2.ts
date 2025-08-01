import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 4039,
        height: 4154,
      },
      focalPoint: {
        x: 2019.5,
        y: 2077,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 690,
          left: 1406,
          width: 1261,
          height: 2731,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1.5,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 697,
          left: 1203,
          width: 1677,
          height: 2276,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.8,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 773,
          left: 1239,
          width: 1552,
          height: 2156,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1.9,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 802,
          left: 244,
          width: 3413,
          height: 1920,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.2,
      },
    },
  },
};

export default config;
