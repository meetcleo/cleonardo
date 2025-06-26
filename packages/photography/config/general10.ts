import { CropType, PhotographyConfig } from '../helpers/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_SMALL, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 4560,
        height: 3189,
      },
      focalPoint: {
        x: 2280,
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
          top: 490,
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
    },
  },
};

export default config;
