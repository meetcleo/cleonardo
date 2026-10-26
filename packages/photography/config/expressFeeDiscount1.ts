import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: ['PORTRAIT_MEDIUM'],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 672,
        height: 1008,
      },
      focalPoint: {
        x: 336,
        y: 504,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 0,
          width: 672,
          height: 1008,
        },
        targetDimensions: {
          width: 360,
          height: 540,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
