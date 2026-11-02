import ctypes as C
E=C.CDLL('libEGL.so.1');P=C.c_void_p;I=C.c_int;U=C.c_uint
E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
address=E.eglGetProcAddress(b'eglGetPlatformDisplayEXT')
if not address:raise SystemExit('no platform display support')
platform=C.CFUNCTYPE(P,U,P,C.POINTER(I))(address)
d=platform(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U
major=I();minor=I()
if not E.eglInitialize(d,C.byref(major),C.byref(minor)):raise SystemExit('EGL unavailable')
E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U
attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038);config=P();count=I()
if not E.eglChooseConfig(d,attrs,C.byref(config),1,C.byref(count)) or not count.value:raise SystemExit('no ES3 config')
E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P
ctx=E.eglCreateContext(d,config,None,(I*3)(0x3098,3,0x3038))
E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P
surface=E.eglCreatePbufferSurface(d,config,(I*5)(0x3057,8,0x3056,8,0x3038))
E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U
if not E.eglMakeCurrent(d,surface,surface,ctx):raise SystemExit('cannot activate ES3 context')
glGetString=C.CFUNCTYPE(C.c_char_p,U)(E.eglGetProcAddress(b'glGetString'))
print(glGetString(0x1F02).decode())
# Offline GLES shader compilation/linking; no browser or application session involved.
import json,sys
shaders=json.load(sys.stdin)
def function(name,result,*args):
    address=E.eglGetProcAddress(name.encode())
    if not address:raise RuntimeError('Missing GL entry point '+name)
    return C.CFUNCTYPE(result,*args)(address)
create=function('glCreateShader',U,U);source=function('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I));compile_shader=function('glCompileShader',None,U)
get_shader=function('glGetShaderiv',None,U,U,C.POINTER(I));shader_log=function('glGetShaderInfoLog',None,U,I,C.POINTER(I),P)
program_create=function('glCreateProgram',U);attach=function('glAttachShader',None,U,U);link=function('glLinkProgram',None,U);get_program=function('glGetProgramiv',None,U,U,C.POINTER(I));program_log=function('glGetProgramInfoLog',None,U,I,C.POINTER(I),P)
delete_shader=function('glDeleteShader',None,U);delete_program=function('glDeleteProgram',None,U)
# Render tiny deterministic samples to verify discard and animated water, not just syntax.
use=function('glUseProgram',None,U);get_uniform=function('glGetUniformLocation',I,U,C.c_char_p)
u1f=function('glUniform1f',None,I,C.c_float);u1i=function('glUniform1i',None,I,I);u3f=function('glUniform3f',None,I,C.c_float,C.c_float,C.c_float);u4f=function('glUniform4f',None,I,C.c_float,C.c_float,C.c_float,C.c_float);um4=function('glUniformMatrix4fv',None,I,I,U,C.POINTER(C.c_float))
gen_buffers=function('glGenBuffers',None,I,C.POINTER(U));bind_buffer=function('glBindBuffer',None,U,U);buffer_data=function('glBufferData',None,U,C.c_ssize_t,P,U)
gen_vaos=function('glGenVertexArrays',None,I,C.POINTER(U));bind_vao=function('glBindVertexArray',None,U);get_attr=function('glGetAttribLocation',I,U,C.c_char_p);enable_attr=function('glEnableVertexAttribArray',None,U);attr_pointer=function('glVertexAttribPointer',None,U,I,U,U,I,P)
gen_textures=function('glGenTextures',None,I,C.POINTER(U));active_texture=function('glActiveTexture',None,U);bind_texture=function('glBindTexture',None,U,U);tex_parameter=function('glTexParameteri',None,U,U,I);tex_image=function('glTexImage2D',None,U,I,I,I,I,I,U,U,P)
clear_color=function('glClearColor',None,C.c_float,C.c_float,C.c_float,C.c_float);clear=function('glClear',None,U);viewport=function('glViewport',None,I,I,I,I);draw=function('glDrawArrays',None,U,I,I);read_pixels=function('glReadPixels',None,I,I,I,I,U,U,P)
def render_probe(program,name):
    use(program);viewport(0,0,8,8)
    def loc(s):return get_uniform(program,s.encode())
    identity=(C.c_float*16)(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)
    for key in ['modelMatrix','modelViewMatrix','viewMatrix','projectionMatrix']:um4(loc(key),1,0,identity)
    for key,value in [('uCurv',0),('uFogDensity',0),('uNight',0),('uWet',0),('uTime',0),('uWaterDetail',3),('toneMappingExposure',1.08),('uShadowStrength',0)]:u1f(loc(key),value)
    for key,values in [('cameraPosition',(0,2,5)),('uTint',(1,1,1)),('uFogColor',(.35,.55,.75)),('uSkyTop',(.08,.25,.5)),('uSunDir',(.3,.8,.4)),('uSunColor',(1,.95,.85))]:u3f(loc(key),*values)
    u4f(loc('uShadowBounds'),0,0,1,1)
    vertices=(C.c_float*30)(-1,-1,0,0,0,1,-1,0,1,0,-1,1,0,0,1,-1,1,0,0,1,1,-1,0,1,0,1,1,0,1,1)
    vao=U();gen_vaos(1,C.byref(vao));bind_vao(vao);vbo=U();gen_buffers(1,C.byref(vbo));bind_buffer(0x8892,vbo);buffer_data(0x8892,C.sizeof(vertices),C.cast(vertices,P),0x88E4)
    for key,count,offset in [('position',3,0),('uv',2,12)]:
        attribute=get_attr(program,key.encode())
        if attribute>=0:enable_attr(attribute);attr_pointer(attribute,count,0x1406,0,20,P(offset))
    textures=[]
    def texture(unit,name,values,width=1,height=1,rgba=False):
        obj=U();gen_textures(1,C.byref(obj));textures.append(obj);active_texture(0x84C0+unit);bind_texture(0x0DE1,obj);tex_parameter(0x0DE1,0x2801,0x2600);tex_parameter(0x0DE1,0x2800,0x2600)
        pixels=(C.c_ubyte*len(values))(*values);tex_image(0x0DE1,0,0x8058 if rgba else 0x8229,width,height,0,0x1908 if rgba else 0x1903,0x1401,C.cast(pixels,P));u1i(loc(name),unit)
    texture(0,'map',[100,80,60,255],rgba=True);texture(2,'uShadowMap',[255])
    def pixels():
        clear_color(1,0,1,1);clear(0x4000);draw(0x0004,0,6);out=(C.c_ubyte*256)();read_pixels(0,0,8,8,0x1908,0x1401,C.cast(out,P));return bytes(out)
    if name=='ground':
        texture(1,'uWaterMask',[0]);dry=pixels();texture(1,'uWaterMask',[255]);wet=pixels();center=(4*8+4)*4
        assert dry[center:center+4]!=bytes([255,0,255,255]),'dry land must render'
        assert wet==bytes([255,0,255,255])*64,'mapped water must discard every terrain fragment'
        texture(1,'uWaterMask',[255,255,255,255,255,0,0,255,255,0,0,255,255,255,255,255],4,4);island=pixels()
        assert island[center:center+4]!=bytes([255,0,255,255]),'islands must remain land'
        assert island[:4]==bytes([255,0,255,255]),'surrounding water must remain cut out'
        print('PASS: GLES render terrain/water mask and dry island')
    if name=='water':
        a=pixels();u1f(loc('uTime'),2.3);b=pixels()
        assert a!=bytes([255,0,255,255])*64,'water must render visible pixels'
        assert a!=b,'water waves/reflections must animate'
        print('PASS: GLES render animated water surface')

for entry in shaders:
    objects=[]
    for stage,kind in [('vertex',0x8B31),('fragment',0x8B30)]:
        shader=create(kind);text=entry[stage].encode();text_ptr=C.c_char_p(text);length=I(len(text));source(shader,1,C.byref(text_ptr),C.byref(length));compile_shader(shader);ok=I();get_shader(shader,0x8B81,C.byref(ok))
        if not ok.value:
            log=C.create_string_buffer(16384);shader_log(shader,len(log),None,log);raise RuntimeError(entry['name']+' '+stage+': '+log.value.decode())
        objects.append(shader)
    program=program_create()
    for shader in objects:attach(program,shader)
    link(program);ok=I();get_program(program,0x8B82,C.byref(ok))
    if not ok.value:
        log=C.create_string_buffer(16384);program_log(program,len(log),None,log);raise RuntimeError(entry['name']+' link: '+log.value.decode())
    print('PASS:',entry['name'],'GLES3 compile/link')
    if entry['name'] in ['ground','water']:render_probe(program,entry['name'])
    delete_program(program)
    for shader in objects:delete_shader(shader)
E.eglMakeCurrent(d,None,None,None)
E.eglDestroySurface.argtypes=[P,P];E.eglDestroySurface(d,surface)
E.eglDestroyContext.argtypes=[P,P];E.eglDestroyContext(d,ctx)
E.eglTerminate.argtypes=[P];E.eglTerminate(d)
