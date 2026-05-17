pipeline {
    agent any

    triggers {
        githubPush()
    }

    environment {
        // Defaults, can be overridden by Jenkins params or environment
        CLUSTER_TYPE = 'minikube'
        REFRESH_TAG = "build-${BUILD_NUMBER}"
        NO_CACHE = '0'
        MINIKUBE_HOME = '/home/shreyasbg'
        KUBECONFIG = '/home/shreyasbg/.kube/config'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Deploy via Ansible') {
            steps {
                sh '''
                    ansible-playbook ansible/deploy.yml \
                        -e "cluster_type=${CLUSTER_TYPE}" \
                        -e "refresh_tag=${REFRESH_TAG}" \
                        -e "no_cache=${NO_CACHE}"
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo "Deployment successful!"
        }
        failure {
            echo "Deployment failed."
        }
    }
}
