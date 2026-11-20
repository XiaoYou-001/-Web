FROM python:3.13-alpine@sha256:9ef1a599f863231c3d91e941389bfdc4a2d6070557243d54df1a4e57015b960e
WORKDIR /app
COPY watch.py ./
COPY web web
RUN mkdir /data && chown 65532:65532 /data
USER 65532:65532
EXPOSE 3001
CMD ["python", "-u", "watch.py"]

