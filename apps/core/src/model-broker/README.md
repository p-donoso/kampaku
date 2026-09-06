# Model Broker

Provider-specific model behavior stays behind this boundary. Core talks to FreeLLMApi (or stubs) through the broker; credentials and upstream provider details do not leak into API clients.
