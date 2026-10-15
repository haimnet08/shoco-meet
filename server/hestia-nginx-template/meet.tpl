server {
    listen      %ip%:%web_port%;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

    root        %docroot%;
    index       index.html;

    location ~ /\.(?!well-known\/) { deny all; return 404; }

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    location /peerjs/ {
        proxy_pass http://127.0.0.1:9000/peerjs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /turn    { proxy_pass http://127.0.0.1:9000/turn;    proxy_set_header X-Real-IP $remote_addr; }
    location = /healthz { proxy_pass http://127.0.0.1:9000/healthz; }

    location /error/ {
        alias %home%/%user%/web/%domain%/document_errors/;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
