// Component
export {MongoComponent, MongoLifecycleObserver} from './mongo.component';

// Binding keys
export {MongoBindings} from './keys';

// Types
export {MongoConnectorConfig} from './types';

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
