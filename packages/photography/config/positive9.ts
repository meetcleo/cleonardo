import { CropType, PhotographyConfig } from '../helpers/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_MEDIUM],
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
          top: 62,
          left: 939,
          width: 2187,
          height: 2967,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.4,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 685,
          left: 447,
          width: 3107,
          height: 1748,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.3,
      },
    },
  },
};

export default config;
