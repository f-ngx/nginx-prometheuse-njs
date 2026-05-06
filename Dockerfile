FROM nginx:1.29-alpine

RUN \
  apk update \
  && apk add --no-cache \
    nginx-module-njs \
    wget \
  && rm -rf /var/cache/apk/*

COPY nginx/ /etc/nginx/
COPY src/ /etc/nginx/src/

RUN mkdir -p /var/log/nginx /var/run
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

