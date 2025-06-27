import { CropType, PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_SMALL, CropType.LANDSCAPE_LARGE, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 2724,
        height: 3189,
      },
      focalPoint: {
        x: 1362,
        y: 1594.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 626,
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
          top: 686,
          left: 603,
          width: 1567,
          height: 2126,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.5,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 1167,
          left: 372,
          width: 1946,
          height: 1094,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.4,
      },
    },
  },
};

export default config;
