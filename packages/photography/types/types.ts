export const CROP_TYPES = ['PORTRAIT_LARGE', 'PORTRAIT_MEDIUM', 'PORTRAIT_SMALL', 'LANDSCAPE_LARGE', 'LANDSCAPE_RATIO_4_3'] as const;

export type CropType = (typeof CROP_TYPES)[number];

export type CropConfig = {
  [key in CropType]: string;
};

export interface PhotographyConfig {
  focalPoint?: {
    originalImage: {
      dimensions: {
        width: number;
        height: number;
      };
      focalPoint: {
        x: number;
        y: number;
        normalizedX: number;
        normalizedY: number;
      };
    };
    crops: {
      [key in CropType]?: {
        extractParams: {
          top: number;
          left: number;
          width: number;
          height: number;
        };
        targetDimensions: {
          width: number;
          height: number;
        };
        zoom?: number;
      };
    };
  };
}

export const cropSpecs: Record<CropType, { width: number; height: number; crop: string }> = {
  PORTRAIT_LARGE: {
    width: 375,
    height: 812,
    crop: 'cover',
  },
  PORTRAIT_MEDIUM: {
    width: 360,
    height: 500,
    crop: 'cover',
  },
  PORTRAIT_SMALL: {
    width: 143,
    height: 194,
    crop: 'cover',
  },
  LANDSCAPE_LARGE: {
    width: 400,
    height: 225,
    crop: 'cover',
  },
  LANDSCAPE_RATIO_4_3: {
    width: 400,
    height: 300,
    crop: 'cover',
  },
};
