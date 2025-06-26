import { CropType, PhotographyConfig } from '../helpers/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_SMALL, CropType.LANDSCAPE_LARGE, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 2752,
        height: 2126,
      },
      focalPoint: {
        x: 1376,
        y: 1063,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 885,
          width: 982,
          height: 2126,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 66,
          left: 816,
          width: 1119,
          height: 1519,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.4,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 449,
          left: 706,
          width: 1448,
          height: 815,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.9,
      },
    },
  },
};

export default config;
