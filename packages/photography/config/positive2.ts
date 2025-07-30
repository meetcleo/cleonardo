import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 5934,
        height: 3189,
      },
      focalPoint: {
        x: 2967,
        y: 1594.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1060,
          width: 1918,
          height: 4154,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 450,
          left: 930,
          width: 2041,
          height: 2769,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.5,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 941,
          left: 0,
          width: 4039,
          height: 2272,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 593,
          left: 951,
          width: 2136,
          height: 2967,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1.4,
      },
    },
  },
};

export default config;
