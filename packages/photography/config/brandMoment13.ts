import { CropType, PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_MEDIUM, CropType.LANDSCAPE_LARGE],
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
          top: 0,
          left: 489,
          width: 3062,
          height: 4154,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 569,
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
          top: 0,
          left: 703,
          width: 2991,
          height: 4154,
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
