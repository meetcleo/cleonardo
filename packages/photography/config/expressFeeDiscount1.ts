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
        x: 255.5,
        y: 291,
        normalizedX: 0.5495,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 46,
          width: 419,
          height: 582,
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
