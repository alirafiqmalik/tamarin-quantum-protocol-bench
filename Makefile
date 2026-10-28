.PHONY: run test evidence archive build

run:
	./run.sh

test:
	python3 -m unittest discover -s tests -p 'test_*.py'
	cd web && npm test --silent

build:
	cd web && npm install --no-audit --no-fund && npm run build
	python3 -m bench.archive

evidence:
	TAMARIN_CORES=$${TAMARIN_CORES:-8} python3 -m bench.batch --timeout $${TIMEOUT:-600}

archive:
	python3 -m bench.archive
