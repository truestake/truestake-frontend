FROM node:20-alpine AS build
WORKDIR /app
RUN printf '<!doctype html><html><body><h1>TrueStake Front</h1></body></html>' > index.html

FROM nginx:alpine
COPY --from=build /app /usr/share/nginx/html
EXPOSE 80
