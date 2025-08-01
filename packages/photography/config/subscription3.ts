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
          top: 967,
          left: 2104,
          width: 1847,
          height: 4000,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1.5,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 958,
          left: 1745,
          width: 2602,
          height: 3529,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.7,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 955,
          left: 1755,
          width: 2541,
          height: 3529,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1.7,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 805,
          left: 0,
          width: 6000,
          height: 3375,
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
