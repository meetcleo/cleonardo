import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: ['PORTRAIT_LARGE'],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 3243,
        height: 7021,
      },
      focalPoint: {
        x: 1621.5,
        y: 2000,
        normalizedX: 0.5,
        normalizedY: 0.3,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 0,
          width: 3243,
          height: 7021,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
