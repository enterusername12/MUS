installation (only for one time)
sign in and download anaconda 
open terminal and open anaconda terminal or 
conda init cmd.exe

set PATH=C:\Users\FT02\anaconda3;C:\Users\FT02\anaconda3\Scripts;%PATH%
conda activate base


type in 
conda create -n mus-cu11 python=3.8 -y
conda activate mus-cu11

pip install -r requirements.txt -f https://download.pytorch.org/whl/torch_stable.html\


next time just need enter these 3 commands: 
open anaconda terminal or conda activate base



conda activate mus-cu11
cd path\to\MUS\AI_Service
python -m uvicorn app:app --host 0.0.0.0 --port 8020