import type {MongoClient} from 'mongodb';

/**
 * Describes the deployment topology shape of a connected MongoClient
 * (standalone, replica set, sharded, or unknown).
 *
 * @public
 */
export interface TopologyInfo {
  isReplicaSet: boolean;
  topologyType: string;
}

/**
 * Detect the topology type of a connected MongoClient.
 * Call after client.connect() has resolved.
 *
 * @remarks
 * Relies on driver internals (`client.topology.description.type`)
 * which are not guaranteed stable across MongoDB driver majors and
 * may need to be revisited on driver upgrades.
 *
 * @experimental
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
