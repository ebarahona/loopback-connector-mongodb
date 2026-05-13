import type {MongoClient} from 'mongodb';

export interface TopologyInfo {
  isReplicaSet: boolean;
  topologyType: string;
}

/**
 * Detect the topology type of a connected MongoClient.
 * Call after client.connect() has resolved.
 */
export function detectTopology(client: MongoClient): TopologyInfo {
  // Access the internal topology description
  // The topology property is available after connection
  const description = (
    client as unknown as {
      topology?: {description?: {type?: string}};
    }
  ).topology?.description;

  const type = description?.type ?? 'Unknown';

  return {
    isReplicaSet:
      type === 'ReplicaSetWithPrimary' ||
      type === 'ReplicaSetNoPrimary' ||
      type === 'Sharded',
    topologyType: type,
  };
}
