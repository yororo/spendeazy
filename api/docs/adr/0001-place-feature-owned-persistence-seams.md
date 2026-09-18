# Place persistence seams inside vertical feature modules

The API uses vertical NestJS feature modules whose application layer owns capability-specific repository ports, while feature-local TypeORM adapters implement those ports. Cross-feature atomic workflows use a project-owned unit of work that supplies repositories created from one transaction-bound `EntityManager`; this keeps controllers and application services independent of TypeORM and prevents writes from escaping a transaction without introducing generic repositories, per-use-case classes, or speculative domain layers.
