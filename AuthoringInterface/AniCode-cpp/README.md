# Building backend binaries for AniCode

Note that below steps are used on Ubuntu 18.04.1 LTS
- [Install OpenCV](https://docs.opencv.org/3.4.5/d7/d9f/tutorial_linux_install.html)
- [Install ZXing C++](https://github.com/glassechidna/zxing-cpp), remember to run `make` and `make install` after `cmake -G "Unix Makefiles" ..`
- Change `main.cpp` according to the comments for building `segment`, `match`, `animate` individually
- `cmake .`
- `make`
- Rename `anicode` to `segment`, `match`, `animate` respectively
