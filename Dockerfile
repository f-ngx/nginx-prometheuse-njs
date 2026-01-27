FROM nginx:alpine

RUN \
  apk update \
   && apk add --no-cache \
    nginx-mod-http-js \
    wget \
   && rm -rf /var/cache/apk/*

COPY nginx.conf /etc/nginx/nginx.conf
COPY src/ /etc/nginx/src/

RUN mkdir -p /var/log/nginx /var/run
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
