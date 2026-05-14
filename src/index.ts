// Component
export {MongoComponent, MongoLifecycleObserver} from './mongo.component';

// Binding keys
export {MongoBindings} from './keys';

// Types
export type {MongoConnectorConfig} from './types';

// Connector (public: class + juggler initializer)
export {MongoConnector, initialize} from './connector';
export type {ModelDefinition, PropertyDefinition} from './connector';

// DataSource (shared-manager juggler DataSource + provider + factory)
export {
  MongoDataSource,
  MongoDataSourceProvider,
  MongoDataSourceFactoryProvider,
} from './datasource';
export type {MongoDataSourceFactory} from './datasource';

// Config validation
export {MongoConfigError, validateConfig, redactUrl} from './helpers';

// Services (public: interface + implementation)
export {MongoService} from './services';
export {MongoServiceImpl} from './services';

// Connection management
export {MongoConnectionManager} from './helpers';
export type {TopologyInfo} from './helpers';

// Typed error classes for instanceof matching
export {MongoConnectorError} from './connector';
export {MongoTopologyError} from './services';
export {MongoConnectionError} from './helpers';

// Change stream transport (experimental)
export {changeStream, CHANGE_STREAM_METADATA} from './decorators';
export type {MongoChangeStreamHandlerOptions} from './decorators';
export {ChangeStreamDiscoverer} from './discovery';
export {MongoChangeStreamServer} from './servers';
export {MongoChangeStreamComponent} from './mongo-change-stream.component';
