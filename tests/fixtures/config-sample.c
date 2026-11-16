standardConfig static_configs[] = {
    createBoolConfig("protected-mode", NULL, MODIFIABLE_CONFIG, server.protected_mode, 1, NULL, NULL),
    createIntConfig("tcp-backlog", NULL, MODIFIABLE_CONFIG, 0, INT_MAX, server.tcp_backlog, 511, INTEGER_CONFIG, NULL, updateTcpBacklog),
    createUIntConfig("maxclients", NULL, MODIFIABLE_CONFIG, 1, UINT_MAX, server.maxclients, 10000, INTEGER_CONFIG, NULL, updateMaxclients),
    createULongLongConfig("maxmemory", NULL, MODIFIABLE_CONFIG, 0, ULLONG_MAX, server.maxmemory, 0, MEMORY_CONFIG, NULL, updateMaxmemory),
    createULongLongConfig("repl-backlog-size", NULL, MODIFIABLE_CONFIG, 16384, LLONG_MAX, server.repl_backlog_size, 1024*1024, MEMORY_CONFIG, NULL, NULL),
    createEnumConfig("maxmemory-policy", NULL, MODIFIABLE_CONFIG, maxmemory_policy_enum, server.maxmemory_policy, MAXMEMORY_NO_EVICTION, NULL, NULL),
    createSDSConfig("requirepass", NULL, MODIFIABLE_CONFIG | SENSITIVE_CONFIG, EMPTY_STRING_IS_NULL, server.requirepass, NULL, NULL, updateRequirePass),
    createSpecialConfig("save", NULL, MODIFIABLE_CONFIG | MULTI_ARG_CONFIG, setConfigSaveOption, getConfigSaveOption, rewriteConfigSaveOption, NULL),
    createReplCfgConfig("newfangled-option", NULL, IMMUTABLE_CONFIG, server.newfangled, 7, NULL, NULL),
};

static configEnum maxmemory_policy_enum[] = {
    {"noeviction", MAXMEMORY_NO_EVICTION},
    {"allkeys-lru", MAXMEMORY_ALLKEYS_LRU},
};
