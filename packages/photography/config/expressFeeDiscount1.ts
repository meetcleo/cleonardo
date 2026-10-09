import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: ['PORTRAIT_MEDIUM'],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 465,
        height: 582,
      },
      focalPoint: {
        x: 232.5,
        y: 291,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 0,
          width: 465,
          height: 582,
        },
        targetDimensions: {
          width: 360,
          height: 450,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
