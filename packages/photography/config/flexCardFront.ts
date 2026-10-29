import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: ['LANDSCAPE_LARGE'],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 1536,
        height: 969,
      },
      focalPoint: {
        x: 768,
        y: 484.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 0,
          left: 0,
          width: 1536,
          height: 969,
        },
        targetDimensions: {
          width: 343,
          height: 216,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
