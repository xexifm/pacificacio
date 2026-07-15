export const CAMERA_TO_NEIGHBOURHOOD: Record<string, string> = {
  'CT10': 'Pedró',
  'CT11': 'Pedró',
  'CT12': 'Pedró',
  'CT13': 'Pedró',
  'CT14': 'Pedró',
  'CT15': 'Pedró',
  'CT16': 'Gavarra',
  'CT17': 'Gavarra',
  'CT18': 'Gavarra',
  'CT19': 'Gavarra',
  'CT20': 'Gavarra',
  'CT21': 'Gavarra',
  'CT22': 'Gavarra',
  'CT23': 'Gavarra',
};

export const NEIGHBOURHOODS = ['Pedró', 'Gavarra'] as const;
export type Neighbourhood = typeof NEIGHBOURHOODS[number];

export function getCameraNeighbourhood(camera: string): string {
  return CAMERA_TO_NEIGHBOURHOOD[camera] || 'Unknown';
}

export function getNeighbourhoodCameras(neighbourhood: string): string[] {
  return Object.entries(CAMERA_TO_NEIGHBOURHOOD)
    .filter(([_, n]) => n === neighbourhood)
    .map(([camera]) => camera);
}
