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
          top: 942,
          left: 2091,
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
          top: 1125,
          left: 1618,
          width: 2764,
          height: 3750,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.6,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 1125,
          left: 1650,
          width: 2700,
          height: 3750,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1.6,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 1166,
          left: 520,
          width: 5000,
          height: 2813,
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
