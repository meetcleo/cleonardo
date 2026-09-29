import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 2436,
        height: 2436,
      },
      focalPoint: {
        x: 1218,
        y: 1218,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      // extractParams are normalized from brandMoment13 (4039×4154) and scaled to 2436×2436
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 639,
          width: 1157,
          height: 2436,
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
          left: 295,
          width: 1847,
          height: 2436,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 334,
          left: 0,
          width: 2436,
          height: 1333,
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
          left: 424,
          width: 1804,
          height: 2436,
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
